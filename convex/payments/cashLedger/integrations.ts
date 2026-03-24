import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import type { CommandSource } from "../../engine/types";
import type { PaymentFrequency } from "../../mortgages/paymentFrequency";
import {
	findCashAccount,
	getOrCreateCashAccount,
	safeBigintToNumber,
} from "./accounts";
import { postCashEntryInternal } from "./postEntry";
import { validatePostingGroupAmounts } from "./postingGroups";
import { buildIdempotencyKey, type CashEntryType } from "./types";

interface LegacySource {
	actor?: string;
	actorId?: string;
	actorType?: CommandSource["actorType"];
	channel?: string;
	ip?: string;
	sessionId?: string;
	type?: "user" | "system" | "webhook" | "cron";
}

function isLegacySource(
	source: CommandSource | LegacySource
): source is LegacySource {
	return "type" in source || "actor" in source;
}

function normalizeSource(source: CommandSource | LegacySource): CommandSource {
	const channel =
		source.channel === "test" || !source.channel
			? "scheduler"
			: (source.channel as CommandSource["channel"]);

	let actorType = source.actorType;
	const legacySource = isLegacySource(source) ? source : undefined;
	if (!actorType && legacySource) {
		if (legacySource.type === "user") {
			actorType = "admin";
		} else if (legacySource.type === "system") {
			actorType = "system";
		}
	}

	return {
		channel,
		actorId:
			source.actorId ??
			legacySource?.actor ??
			(legacySource?.type === "system" ? "system" : undefined),
		actorType,
		ip: source.ip,
		sessionId: source.sessionId,
	};
}

function unixMsToBusinessDate(ms: number) {
	return new Date(ms).toISOString().slice(0, 10);
}

export async function postObligationAccrued(
	ctx: MutationCtx,
	args: {
		obligationId: Id<"obligations">;
		source: CommandSource;
	}
) {
	const obligation = await ctx.db.get(args.obligationId);
	if (!obligation) {
		throw new ConvexError(`Obligation not found: ${args.obligationId}`);
	}

	const receivableAccount = await getOrCreateCashAccount(ctx, {
		family: "BORROWER_RECEIVABLE",
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
		borrowerId: obligation.borrowerId,
	});
	const accrualControlAccount = await getOrCreateCashAccount(ctx, {
		family: "CONTROL",
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
		subaccount: "ACCRUAL",
	});

	return postCashEntryInternal(ctx, {
		entryType: "OBLIGATION_ACCRUED",
		effectiveDate: unixMsToBusinessDate(obligation.dueDate),
		amount: obligation.amount,
		debitAccountId: receivableAccount._id,
		creditAccountId: accrualControlAccount._id,
		idempotencyKey: buildIdempotencyKey("obligation-accrued", obligation._id),
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
		borrowerId: obligation.borrowerId,
		source: normalizeSource(args.source),
		metadata: {
			obligationType: obligation.type,
			amountSettledProjection: obligation.amountSettled,
		},
	});
}

export async function postCashReceiptForObligation(
	ctx: MutationCtx,
	args: {
		obligationId: Id<"obligations">;
		amount: number;
		idempotencyKey: string;
		effectiveDate?: string;
		attemptId?: Id<"collectionAttempts">;
		postingGroupId?: string;
		source: CommandSource;
	}
) {
	const obligation = await ctx.db.get(args.obligationId);
	if (!obligation) {
		throw new ConvexError(`Obligation not found: ${args.obligationId}`);
	}

	const receivableAccount = await findCashAccount(ctx.db, {
		family: "BORROWER_RECEIVABLE",
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
	});

	if (!receivableAccount) {
		// No matching receivable — skip posting, let ENG-156 reconciliation detect the gap.
		// TODO: ENG-156 — implement SUSPENSE routing for unmatched cash
		console.warn(
			`[postCashReceiptForObligation] No BORROWER_RECEIVABLE account for obligation=${args.obligationId}. Skipping cash receipt. ENG-156 reconciliation will detect this gap.`
		);
		return null;
	}

	const trustCashAccount = await getOrCreateCashAccount(ctx, {
		family: "TRUST_CASH",
		mortgageId: obligation.mortgageId,
	});

	return postCashEntryInternal(ctx, {
		entryType: "CASH_RECEIVED",
		effectiveDate:
			args.effectiveDate ??
			unixMsToBusinessDate(obligation.settledAt ?? Date.now()),
		amount: args.amount,
		debitAccountId: trustCashAccount._id,
		creditAccountId: receivableAccount._id,
		idempotencyKey: args.idempotencyKey,
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
		attemptId: args.attemptId,
		borrowerId: obligation.borrowerId,
		postingGroupId: args.postingGroupId,
		source: normalizeSource(args.source),
		metadata: {
			projectionAmountSettled: obligation.amountSettled,
		},
	});
}

export async function postDealBuyerFundsReceived(
	ctx: MutationCtx,
	args: {
		dealId: Id<"deals">;
		amount: number;
		effectiveDate: string;
		source: CommandSource;
	}
) {
	const deal = await ctx.db.get(args.dealId);
	if (!deal) {
		throw new ConvexError(`Deal not found: ${args.dealId}`);
	}

	const trustCashAccount = await getOrCreateCashAccount(ctx, {
		family: "TRUST_CASH",
		mortgageId: deal.mortgageId,
	});
	const cashClearingAccount = await getOrCreateCashAccount(ctx, {
		family: "CASH_CLEARING",
		mortgageId: deal.mortgageId,
	});

	return postCashEntryInternal(ctx, {
		entryType: "CASH_RECEIVED",
		effectiveDate: args.effectiveDate,
		amount: args.amount,
		debitAccountId: trustCashAccount._id,
		creditAccountId: cashClearingAccount._id,
		// One buyer-funds entry per deal — idempotency key intentionally scoped to dealId only
		idempotencyKey: buildIdempotencyKey("deal-buyer-funds", args.dealId),
		mortgageId: deal.mortgageId,
		dealId: args.dealId,
		source: normalizeSource(args.source),
		metadata: { buyerId: deal.buyerId, sellerId: deal.sellerId },
	});
}

export async function postDealSellerPayout(
	ctx: MutationCtx,
	args: {
		dealId: Id<"deals">;
		lenderId: Id<"lenders">;
		amount: number;
		effectiveDate: string;
		source: CommandSource;
	}
) {
	const deal = await ctx.db.get(args.dealId);
	if (!deal) {
		throw new ConvexError(`Deal not found: ${args.dealId}`);
	}

	const lenderPayableAccount = await getOrCreateCashAccount(ctx, {
		family: "LENDER_PAYABLE",
		mortgageId: deal.mortgageId,
		lenderId: args.lenderId,
	});
	const trustCashAccount = await getOrCreateCashAccount(ctx, {
		family: "TRUST_CASH",
		mortgageId: deal.mortgageId,
	});

	return postCashEntryInternal(ctx, {
		entryType: "LENDER_PAYOUT_SENT",
		effectiveDate: args.effectiveDate,
		amount: args.amount,
		debitAccountId: lenderPayableAccount._id,
		creditAccountId: trustCashAccount._id,
		idempotencyKey: buildIdempotencyKey(
			"deal-seller-payout",
			args.dealId,
			args.lenderId
		),
		mortgageId: deal.mortgageId,
		dealId: args.dealId,
		lenderId: args.lenderId,
		source: normalizeSource(args.source),
		metadata: { sellerId: deal.sellerId, buyerId: deal.buyerId },
	});
}

export async function postLockingFeeReceived(
	ctx: MutationCtx,
	args: {
		feeId: string;
		mortgageId: Id<"mortgages">;
		amount: number;
		effectiveDate: string;
		dealId?: Id<"deals">;
		source: CommandSource;
	}
) {
	const trustCashAccount = await getOrCreateCashAccount(ctx, {
		family: "TRUST_CASH",
		mortgageId: args.mortgageId,
	});
	const unappliedCashAccount = await getOrCreateCashAccount(ctx, {
		family: "UNAPPLIED_CASH",
		mortgageId: args.mortgageId,
	});

	return postCashEntryInternal(ctx, {
		entryType: "CASH_RECEIVED",
		effectiveDate: args.effectiveDate,
		amount: args.amount,
		debitAccountId: trustCashAccount._id,
		creditAccountId: unappliedCashAccount._id,
		idempotencyKey: args.dealId
			? buildIdempotencyKey(
					"locking-fee",
					args.dealId,
					args.mortgageId,
					args.feeId
				)
			: buildIdempotencyKey("locking-fee", args.mortgageId, args.feeId),
		mortgageId: args.mortgageId,
		dealId: args.dealId,
		source: normalizeSource(args.source),
		metadata: { feeType: "locking_fee", feeId: args.feeId },
	});
}

export async function postCommitmentDepositReceived(
	ctx: MutationCtx,
	args: {
		depositId: string;
		mortgageId: Id<"mortgages">;
		amount: number;
		effectiveDate: string;
		dealId?: Id<"deals">;
		source: CommandSource;
	}
) {
	const trustCashAccount = await getOrCreateCashAccount(ctx, {
		family: "TRUST_CASH",
		mortgageId: args.mortgageId,
	});
	const unappliedCashAccount = await getOrCreateCashAccount(ctx, {
		family: "UNAPPLIED_CASH",
		mortgageId: args.mortgageId,
	});

	return postCashEntryInternal(ctx, {
		entryType: "CASH_RECEIVED",
		effectiveDate: args.effectiveDate,
		amount: args.amount,
		debitAccountId: trustCashAccount._id,
		creditAccountId: unappliedCashAccount._id,
		idempotencyKey: args.dealId
			? buildIdempotencyKey(
					"commitment-deposit",
					args.dealId,
					args.mortgageId,
					args.depositId
				)
			: buildIdempotencyKey(
					"commitment-deposit",
					args.mortgageId,
					args.depositId
				),
		mortgageId: args.mortgageId,
		dealId: args.dealId,
		source: normalizeSource(args.source),
		metadata: {
			feeType: "commitment_deposit",
			depositId: args.depositId,
		},
	});
}

export async function postOverpaymentToUnappliedCash(
	ctx: MutationCtx,
	args: {
		attemptId: Id<"collectionAttempts">;
		amount: number;
		mortgageId: Id<"mortgages">;
		borrowerId?: Id<"borrowers">;
		postingGroupId: string;
		source: CommandSource;
	}
) {
	const trustCashAccount = await getOrCreateCashAccount(ctx, {
		family: "TRUST_CASH",
		mortgageId: args.mortgageId,
	});
	const unappliedCashAccount = await getOrCreateCashAccount(ctx, {
		family: "UNAPPLIED_CASH",
		mortgageId: args.mortgageId,
	});

	return postCashEntryInternal(ctx, {
		entryType: "CASH_RECEIVED",
		effectiveDate: unixMsToBusinessDate(Date.now()),
		amount: args.amount,
		debitAccountId: trustCashAccount._id,
		creditAccountId: unappliedCashAccount._id,
		idempotencyKey: buildIdempotencyKey("overpayment", args.attemptId),
		mortgageId: args.mortgageId,
		attemptId: args.attemptId,
		borrowerId: args.borrowerId,
		postingGroupId: args.postingGroupId,
		source: normalizeSource(args.source),
		reason: "Overpayment: excess beyond obligation balances",
	});
}

export interface ServicingFeeMetadata {
	annualRate: number;
	feeCashApplied: number;
	feeCode?: string;
	feeDue: number;
	feeReceivable: number;
	mortgageFeeId?: string;
	paymentFrequency: PaymentFrequency;
	policyVersion?: number;
	principalBalance: number;
	[key: string]: unknown;
}

export async function postSettlementAllocation(
	ctx: MutationCtx,
	args: {
		obligationId: Id<"obligations">;
		mortgageId: Id<"mortgages">;
		settledDate: string;
		servicingFee: number;
		entries: Array<{
			dispersalEntryId: Id<"dispersalEntries">;
			lenderId: Id<"lenders">;
			amount: number;
		}>;
		source: CommandSource;
		feeMetadata?: ServicingFeeMetadata;
	}
) {
	const obligation = await ctx.db.get(args.obligationId);
	if (!obligation) {
		throw new ConvexError(`Obligation not found: ${args.obligationId}`);
	}

	validatePostingGroupAmounts(
		obligation.amount,
		args.entries.map((e) => e.amount),
		args.servicingFee
	);

	const allocationControlAccount = await getOrCreateCashAccount(ctx, {
		family: "CONTROL",
		mortgageId: args.mortgageId,
		obligationId: args.obligationId,
		subaccount: "ALLOCATION",
	});

	for (const entry of args.entries) {
		const lenderPayableAccount = await getOrCreateCashAccount(ctx, {
			family: "LENDER_PAYABLE",
			mortgageId: args.mortgageId,
			lenderId: entry.lenderId,
		});

		await postCashEntryInternal(ctx, {
			entryType: "LENDER_PAYABLE_CREATED",
			effectiveDate: args.settledDate,
			amount: entry.amount,
			debitAccountId: allocationControlAccount._id,
			creditAccountId: lenderPayableAccount._id,
			idempotencyKey: buildIdempotencyKey(
				"lender-payable",
				entry.dispersalEntryId
			),
			mortgageId: args.mortgageId,
			obligationId: args.obligationId,
			dispersalEntryId: entry.dispersalEntryId,
			lenderId: entry.lenderId,
			borrowerId: obligation.borrowerId,
			postingGroupId: `allocation:${args.obligationId}`,
			source: normalizeSource(args.source),
		});
	}

	if (args.servicingFee > 0) {
		const servicingRevenueAccount = await getOrCreateCashAccount(ctx, {
			family: "SERVICING_REVENUE",
			mortgageId: args.mortgageId,
		});

		await postCashEntryInternal(ctx, {
			entryType: "SERVICING_FEE_RECOGNIZED",
			effectiveDate: args.settledDate,
			amount: args.servicingFee,
			debitAccountId: allocationControlAccount._id,
			creditAccountId: servicingRevenueAccount._id,
			idempotencyKey: buildIdempotencyKey("servicing-fee", args.obligationId),
			mortgageId: args.mortgageId,
			obligationId: args.obligationId,
			borrowerId: obligation.borrowerId,
			postingGroupId: `allocation:${args.obligationId}`,
			source: normalizeSource(args.source),
			...(args.feeMetadata
				? {
						metadata: args.feeMetadata,
					}
				: {}),
		});
	}
}

// ── SUSPENSE Routing ─────────────────────────────────────────────────

async function postToSuspense(
	ctx: MutationCtx,
	args: {
		mortgageId: Id<"mortgages">;
		amount: number;
		idempotencyKey: string;
		effectiveDate: string;
		attemptId?: Id<"collectionAttempts">;
		source: CommandSource;
		reason: string;
		metadata: Record<string, unknown>;
	}
) {
	const suspenseAccount = await getOrCreateCashAccount(ctx, {
		family: "SUSPENSE",
		mortgageId: args.mortgageId,
	});

	const cashClearingAccount = await getOrCreateCashAccount(ctx, {
		family: "CASH_CLEARING",
		mortgageId: args.mortgageId,
	});

	const result = await postCashEntryInternal(ctx, {
		entryType: "SUSPENSE_ROUTED",
		effectiveDate: args.effectiveDate,
		amount: args.amount,
		debitAccountId: suspenseAccount._id,
		creditAccountId: cashClearingAccount._id,
		idempotencyKey: args.idempotencyKey,
		mortgageId: args.mortgageId,
		attemptId: args.attemptId,
		source: args.source,
		reason: args.reason,
		metadata: args.metadata,
	});

	await auditLog.log(ctx, {
		action: "cashLedger.suspense_routed",
		actorId: args.source.actorId ?? "system",
		resourceType: "mortgage",
		resourceId: args.mortgageId,
		severity: "warning",
		metadata: {
			...args.metadata,
			actorType: args.source.actorType,
			channel: args.source.channel,
		},
	});

	return result;
}

export async function postCashReceiptWithSuspenseFallback(
	ctx: MutationCtx,
	args: {
		obligationId?: Id<"obligations">;
		mortgageId?: Id<"mortgages">;
		amount: number;
		idempotencyKey: string;
		effectiveDate?: string;
		attemptId?: Id<"collectionAttempts">;
		source: CommandSource;
		mismatchReason?: string;
	}
) {
	const effectiveDate = args.effectiveDate ?? unixMsToBusinessDate(Date.now());
	const normalizedSource = normalizeSource(args.source);

	// Happy path: obligation provided and exists
	if (args.obligationId) {
		const obligation = await ctx.db.get(args.obligationId);
		if (obligation) {
			return postCashReceiptForObligation(ctx, {
				obligationId: obligation._id,
				amount: args.amount,
				idempotencyKey: args.idempotencyKey,
				effectiveDate,
				attemptId: args.attemptId,
				source: normalizedSource,
			});
		}
	}

	// Fallback: route to SUSPENSE
	const reason =
		args.mismatchReason ??
		(args.obligationId ? "obligation_not_found" : "no_obligation_reference");

	if (!args.mortgageId) {
		throw new ConvexError(
			"postCashReceiptWithSuspenseFallback: mortgageId is required when routing to SUSPENSE (no matched obligation)"
		);
	}

	return postToSuspense(ctx, {
		mortgageId: args.mortgageId,
		amount: args.amount,
		idempotencyKey: `suspense-routed:${args.idempotencyKey}`,
		effectiveDate,
		attemptId: args.attemptId,
		source: normalizedSource,
		reason,
		metadata: {
			reason,
			originalObligationId: args.obligationId ?? null,
			originalAmount: args.amount,
			attemptId: args.attemptId ?? null,
		},
	});
}

// ── Cash Correction ──────────────────────────────────────────────────

const CORRECTION_REQUIRES_ADMIN =
	'Cash correction requires admin actorType (source.actorType must be "admin")';

function assertAdminCorrectionSource(source: CommandSource) {
	if (source.actorType !== "admin") {
		throw new ConvexError(CORRECTION_REQUIRES_ADMIN);
	}
	if (!source.actorId?.trim()) {
		throw new ConvexError("Cash correction requires source.actorId");
	}
}

function assertNonEmptyCorrectionReason(reason: string) {
	if (!reason.trim()) {
		throw new ConvexError("Cash correction requires a non-empty reason");
	}
}

export async function postCashCorrectionForEntry(
	ctx: MutationCtx,
	args: {
		originalEntryId: Id<"cash_ledger_journal_entries">;
		reason: string;
		source: CommandSource;
		effectiveDate?: string;
		replacement?: {
			amount: number;
			debitAccountId: Id<"cash_ledger_accounts">;
			creditAccountId: Id<"cash_ledger_accounts">;
			entryType: CashEntryType;
			metadata?: Record<string, unknown>;
		};
	}
) {
	assertNonEmptyCorrectionReason(args.reason);

	const normalizedSource = normalizeSource(args.source);
	assertAdminCorrectionSource(normalizedSource);

	// 1. Load original entry, validate existence
	const original = await ctx.db.get(args.originalEntryId);
	if (!original) {
		throw new ConvexError(`Original entry not found: ${args.originalEntryId}`);
	}

	// 2. Determine effective date
	const effectiveDate =
		args.effectiveDate ?? new Date().toISOString().slice(0, 10);

	// 3. Convert original amount once for reuse
	const originalAmountNumber = safeBigintToNumber(original.amount);

	// 4. Generate posting group ID (reversal row carries canonical id; idempotent replays use it)
	const postingGroupId = `correction:${original._id}:${Date.now()}`;

	// 5. Post REVERSAL with swapped accounts
	const reversalResult = await postCashEntryInternal(ctx, {
		entryType: "REVERSAL",
		effectiveDate,
		amount: originalAmountNumber,
		debitAccountId: original.creditAccountId,
		creditAccountId: original.debitAccountId,
		causedBy: original._id,
		postingGroupId,
		reason: args.reason,
		source: normalizedSource,
		idempotencyKey: buildIdempotencyKey("correction-reversal", original._id),
		mortgageId: original.mortgageId,
		obligationId: original.obligationId,
		attemptId: original.attemptId,
		dispersalEntryId: original.dispersalEntryId,
		lenderId: original.lenderId,
		borrowerId: original.borrowerId,
		dealId: original.dealId,
		transferRequestId: original.transferRequestId,
	});

	const canonicalPostingGroupId =
		reversalResult.entry.postingGroupId ?? postingGroupId;

	// 6. Reject mismatched retries: query existing entries for this postingGroupId
	// and verify the persisted correction matches the incoming payload.
	{
		const existingEntries = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_posting_group", (q) =>
				q.eq("postingGroupId", canonicalPostingGroupId)
			)
			.collect();

		// Identify replacement entries: causedBy points to the original, exclude the REVERSAL entry itself.
		// The replacement uses the caller's entryType (e.g. OBLIGATION_ACCRUED), NOT a "REPLACEMENT" type.
		const persistedCorrections = existingEntries.filter(
			(e) => e.causedBy === original._id && e.entryType !== "REVERSAL"
		);

		if (persistedCorrections.length > 0) {
			const existing = persistedCorrections.at(0);
			if (!existing) {
				throw new ConvexError(
					"Unexpected empty correction entries after filtering"
				);
			}
			// Compare critical fields against the incoming replacement args
			if (args.replacement) {
				const mismatch =
					existing.reason !== args.reason ||
					existing.effectiveDate !== effectiveDate ||
					existing.entryType !== args.replacement.entryType ||
					safeBigintToNumber(existing.amount) !== args.replacement.amount ||
					existing.debitAccountId !== args.replacement.debitAccountId ||
					existing.creditAccountId !== args.replacement.creditAccountId ||
					JSON.stringify(existing.metadata) !==
						JSON.stringify(args.replacement.metadata ?? {});

				if (mismatch) {
					throw new ConvexError(
						"Mismatched correction retry: persisted replacement does not match incoming payload"
					);
				}
			} else {
				// A replacement was persisted but the current call has no replacement
				throw new ConvexError(
					"Mismatched correction retry: persisted replacement exists but no replacement provided"
				);
			}
		}
	}

	// 7. Optionally post replacement entry
	let replacementResult: Awaited<
		ReturnType<typeof postCashEntryInternal>
	> | null = null;
	if (args.replacement) {
		if (args.replacement.amount <= 0) {
			throw new ConvexError(
				`Replacement amount must be positive, got ${args.replacement.amount}`
			);
		}
		if (args.replacement.amount > originalAmountNumber) {
			throw new ConvexError(
				`Replacement amount (${args.replacement.amount}) must not exceed original amount (${originalAmountNumber})`
			);
		}

		replacementResult = await postCashEntryInternal(ctx, {
			entryType: args.replacement.entryType,
			effectiveDate,
			amount: args.replacement.amount,
			debitAccountId: args.replacement.debitAccountId,
			creditAccountId: args.replacement.creditAccountId,
			causedBy: original._id,
			postingGroupId: canonicalPostingGroupId,
			idempotencyKey: buildIdempotencyKey(
				"correction-replacement",
				original._id
			),
			mortgageId: original.mortgageId,
			obligationId: original.obligationId,
			attemptId: original.attemptId,
			dispersalEntryId: original.dispersalEntryId,
			lenderId: original.lenderId,
			borrowerId: original.borrowerId,
			dealId: original.dealId,
			transferRequestId: original.transferRequestId,
			reason: args.reason,
			source: normalizedSource,
			metadata: args.replacement.metadata,
		});
	}

	// 8. Return results (postingGroupId matches persisted reversal for idempotent retries)
	return {
		reversalEntry: reversalResult.entry,
		replacementEntry: replacementResult?.entry ?? null,
		postingGroupId: canonicalPostingGroupId,
	};
}
