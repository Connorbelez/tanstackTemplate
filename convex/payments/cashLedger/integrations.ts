import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import type { CommandSource } from "../../engine/types";
import type { PaymentFrequency } from "../../mortgages/paymentFrequency";
import {
	findCashAccount,
	getCashAccountBalance,
	getOrCreateCashAccount,
	requireCashAccount,
	safeBigintToNumber,
} from "./accounts";
import { postCashEntryInternal } from "./postEntry";
import { validatePostingGroupAmounts } from "./postingGroups";
import {
	buildIdempotencyKey,
	type CashAccountFamily,
	type CashEntryType,
} from "./types";

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

function assertReversalAmountValid(
	reversalAmount: number,
	originalAmount: bigint,
	context: string
): void {
	if (!Number.isSafeInteger(reversalAmount) || reversalAmount <= 0) {
		throw new ConvexError({
			code: "INVALID_REVERSAL_AMOUNT" as const,
			reversalAmount,
			context,
		});
	}
	const originalNumber = safeBigintToNumber(originalAmount);
	if (reversalAmount > originalNumber) {
		throw new ConvexError({
			code: "REVERSAL_EXCEEDS_ORIGINAL" as const,
			reversalAmount,
			originalAmount: originalNumber,
			context,
		});
	}
}

/**
 * Validates that caller-supplied dimension IDs match the original entry's
 * dimensions. Throws DIMENSION_MISMATCH if a non-null original dimension
 * differs from the supplied value.
 */
function assertDimensionMatch(
	original: Doc<"cash_ledger_journal_entries">,
	dimensions: {
		mortgageId?: Id<"mortgages">;
		obligationId?: Id<"obligations">;
	}
): void {
	if (original.mortgageId && original.mortgageId !== dimensions.mortgageId) {
		throw new ConvexError({
			code: "DIMENSION_MISMATCH" as const,
			dimension: "mortgageId",
			expected: original.mortgageId,
			received: dimensions.mortgageId,
		});
	}
	if (
		original.obligationId &&
		original.obligationId !== dimensions.obligationId
	) {
		throw new ConvexError({
			code: "DIMENSION_MISMATCH" as const,
			dimension: "obligationId",
			expected: original.obligationId,
			received: dimensions.obligationId,
		});
	}
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
	// Page 14 boundary lock: borrower cash posting derives meaning from the
	// obligation and its scoped ledger accounts. Attempt metadata is carried only
	// for traceability and reconciliation, never as the source of journal meaning.
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
		// No matching receivable — log error and emit audit entry so the gap is immediately visible.
		// Callers should use postCashReceiptWithSuspenseFallback to route to SUSPENSE.
		console.error(
			`[postCashReceiptForObligation] No BORROWER_RECEIVABLE account for obligation=${args.obligationId}. ` +
				"Cash receipt not journaled — use postCashReceiptWithSuspenseFallback to route to SUSPENSE."
		);
		await auditLog.log(ctx, {
			action: "cashLedger.receivable_not_found",
			actorId: args.source.actorId ?? "system",
			resourceType: "obligation",
			resourceId: args.obligationId,
			severity: "error",
			metadata: {
				amount: args.amount,
				attemptId: args.attemptId ?? null,
				idempotencyKey: args.idempotencyKey,
				reason: "BORROWER_RECEIVABLE account not found",
			},
		});
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

export interface ServicingFeeMetadata extends Record<string, unknown> {
	/** Additional structured fields for future extensibility. */
	additionalFields?: Record<string, unknown>;
	annualRate: number;
	feeCashApplied: number;
	feeCode?: string;
	feeDue: number;
	feeReceivable: number;
	mortgageFeeId?: string;
	paymentFrequency: PaymentFrequency;
	policyVersion?: number;
	principalBalance: number;
}

export async function postSettlementAllocation(
	ctx: MutationCtx,
	args: {
		obligationId: Id<"obligations">;
		mortgageId: Id<"mortgages">;
		settledDate: string;
		/** Gross cash allocated in this settlement (lender totals + servicing). Defaults to `obligation.amount` when omitted. */
		settledAmount?: number;
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

	const grossAllocation = args.settledAmount ?? obligation.amount;
	validatePostingGroupAmounts(
		grossAllocation,
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

// ── Waiver ───────────────────────────────────────────────────────────

export async function postObligationWaiver(
	ctx: MutationCtx,
	args: {
		obligationId: Id<"obligations">;
		amount: number;
		reason: string;
		idempotencyKey: string;
		effectiveDate?: string;
		source: CommandSource;
		outstandingBefore: number;
		outstandingAfter: number;
		isFullWaiver: boolean;
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
		throw new ConvexError(
			`No BORROWER_RECEIVABLE account for obligation=${args.obligationId}. Cannot waive without an existing receivable.`
		);
	}

	const waiverControlAccount = await getOrCreateCashAccount(ctx, {
		family: "CONTROL",
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
		subaccount: "WAIVER",
	});

	return postCashEntryInternal(ctx, {
		entryType: "OBLIGATION_WAIVED",
		effectiveDate: args.effectiveDate ?? unixMsToBusinessDate(Date.now()),
		amount: args.amount,
		debitAccountId: waiverControlAccount._id,
		creditAccountId: receivableAccount._id,
		idempotencyKey: args.idempotencyKey,
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
		borrowerId: obligation.borrowerId,
		source: normalizeSource(args.source),
		reason: args.reason,
		metadata: {
			waiverAmount: args.amount,
			obligationAmount: obligation.amount,
			amountSettled: obligation.amountSettled,
			outstandingBefore: args.outstandingBefore,
			outstandingAfter: args.outstandingAfter,
			isFullWaiver: args.isFullWaiver,
		},
	});
}

// ── Write-Off ────────────────────────────────────────────────────────

export async function postObligationWriteOff(
	ctx: MutationCtx,
	args: {
		obligationId: Id<"obligations">;
		amount: number;
		reason: string;
		source: CommandSource;
		/** Caller-scoped idempotency key (already prefixed via buildIdempotencyKey). */
		idempotencyKey: string;
		/** Pre-loaded obligation to avoid a redundant DB round-trip. If omitted the function loads it. */
		obligation?: Doc<"obligations">;
	}
) {
	const obligation = args.obligation ?? (await ctx.db.get(args.obligationId));
	if (!obligation) {
		throw new ConvexError(`Obligation not found: ${args.obligationId}`);
	}

	// Early idempotency short-circuit — must run before balance validation so
	// retries succeed even after the first post reduced the receivable balance.
	const existingEntry = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_idempotency", (q) =>
			q.eq("idempotencyKey", args.idempotencyKey)
		)
		.first();
	if (existingEntry) {
		return {
			entry: existingEntry,
			projectedDebitBalance: 0n,
			projectedCreditBalance: 0n,
		};
	}

	// Validate: write-off amount <= outstanding receivable balance
	if (!Number.isSafeInteger(args.amount) || args.amount <= 0) {
		throw new ConvexError(
			"Write-off amount must be a positive safe integer (cents)"
		);
	}
	const receivableAccount = await requireCashAccount(
		ctx.db,
		{
			family: "BORROWER_RECEIVABLE",
			mortgageId: obligation.mortgageId,
			obligationId: obligation._id,
		},
		"postObligationWriteOff"
	);
	const outstandingBalance = getCashAccountBalance(receivableAccount);
	const writeOffAmount = BigInt(args.amount);
	if (writeOffAmount > outstandingBalance) {
		throw new ConvexError(
			`Write-off amount ${args.amount} exceeds outstanding balance ${outstandingBalance}`
		);
	}

	const writeOffAccount = await getOrCreateCashAccount(ctx, {
		family: "WRITE_OFF",
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
	});

	return postCashEntryInternal(ctx, {
		entryType: "OBLIGATION_WRITTEN_OFF",
		effectiveDate: unixMsToBusinessDate(Date.now()),
		amount: args.amount,
		debitAccountId: writeOffAccount._id,
		creditAccountId: receivableAccount._id,
		idempotencyKey: args.idempotencyKey,
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
		borrowerId: obligation.borrowerId,
		source: normalizeSource(args.source),
		reason: args.reason,
	});
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
			const result = await postCashReceiptForObligation(ctx, {
				obligationId: obligation._id,
				amount: args.amount,
				idempotencyKey: args.idempotencyKey,
				effectiveDate,
				attemptId: args.attemptId,
				source: normalizedSource,
			});

			// postCashReceiptForObligation returns null when the BORROWER_RECEIVABLE
			// account is missing. Recover by routing to SUSPENSE so the receipt is journaled.
			if (result === null) {
				return postToSuspense(ctx, {
					mortgageId: obligation.mortgageId,
					amount: args.amount,
					idempotencyKey: `suspense-routed:${args.idempotencyKey}`,
					effectiveDate,
					attemptId: args.attemptId,
					source: normalizedSource,
					reason: "receivable_not_found",
					metadata: {
						originalObligationId: args.obligationId,
						originalAmount: args.amount,
						attemptId: args.attemptId ?? null,
					},
				});
			}

			return result;
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

// ── Cash Application ─────────────────────────────────────────────────

export async function postCashApplication(
	ctx: MutationCtx,
	args: {
		sourceAccountId: Id<"cash_ledger_accounts">;
		targetObligationId: Id<"obligations">;
		amount: number;
		reason: string;
		sourceEntryId?: Id<"cash_ledger_journal_entries">;
		source: CommandSource;
		/** Caller-supplied idempotency key — must be stable across retries. */
		idempotencyKey: string;
	}
) {
	// 1. Validate source account exists and is UNAPPLIED_CASH or SUSPENSE
	const sourceAccount = await ctx.db.get(args.sourceAccountId);
	if (!sourceAccount) {
		throw new ConvexError(`Source account not found: ${args.sourceAccountId}`);
	}
	if (
		sourceAccount.family !== "UNAPPLIED_CASH" &&
		sourceAccount.family !== "SUSPENSE"
	) {
		throw new ConvexError(
			`Source account must be UNAPPLIED_CASH or SUSPENSE family, got ${sourceAccount.family}`
		);
	}

	const idempotencyKey = buildIdempotencyKey(
		"cash-application",
		args.sourceAccountId,
		args.targetObligationId,
		args.idempotencyKey
	);

	// 2. Idempotent replay — return the existing entry before balance/status checks
	// so retries after a successful post do not fail on depleted source balance.
	const existingApplication = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
		.first();
	if (existingApplication) {
		return {
			entry: existingApplication,
			debitBalanceBefore: 0n,
			creditBalanceBefore: 0n,
			projectedDebitBalance: 0n,
			projectedCreditBalance: 0n,
		};
	}

	// 3. Validate sufficient balance
	const balance = getCashAccountBalance(sourceAccount);
	if (balance < BigInt(args.amount)) {
		throw new ConvexError(
			`Insufficient balance in source account: balance=${balance}, requested=${args.amount}`
		);
	}

	// 4. Load target obligation and validate status
	const obligation = await ctx.db.get(args.targetObligationId);
	if (!obligation) {
		throw new ConvexError(
			`Target obligation not found: ${args.targetObligationId}`
		);
	}
	if (obligation.status === "settled" || obligation.status === "waived") {
		throw new ConvexError(
			`Cannot apply cash to obligation in "${obligation.status}" status`
		);
	}

	// 5. Enforce mortgage scope — source and obligation must belong to the same loan
	if (
		sourceAccount.mortgageId !== undefined &&
		sourceAccount.mortgageId !== obligation.mortgageId
	) {
		throw new ConvexError(
			`Source account mortgage ${sourceAccount.mortgageId} does not match obligation mortgage ${obligation.mortgageId}`
		);
	}
	if (sourceAccount.mortgageId === undefined) {
		throw new ConvexError(
			"Source account must be scoped to a mortgage for cash application"
		);
	}

	// 6. Find or create BORROWER_RECEIVABLE account for the obligation
	const receivableAccount = await getOrCreateCashAccount(ctx, {
		family: "BORROWER_RECEIVABLE",
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
		borrowerId: obligation.borrowerId,
	});

	// 7. Choose entry type based on source family
	// SUSPENSE_ESCALATED is Dr SUSPENSE / Cr BORROWER_RECEIVABLE (same mechanical
	// shape as dispersal escalation in selfHealing). Both accounts are debit-normal;
	// crediting receivable reduces the obligation balance. A single two-sided entry
	// cannot credit both suspense and receivable — clearing suspense against AR may
	// require an additional leg or entry type if ledger-level suspense consumption is required.
	const entryType: CashEntryType =
		sourceAccount.family === "SUSPENSE" ? "SUSPENSE_ESCALATED" : "CASH_APPLIED";

	// 8. Post journal entry
	return postCashEntryInternal(ctx, {
		entryType,
		effectiveDate: unixMsToBusinessDate(Date.now()),
		amount: args.amount,
		debitAccountId: args.sourceAccountId,
		creditAccountId: receivableAccount._id,
		causedBy: args.sourceEntryId,
		idempotencyKey,
		mortgageId: obligation.mortgageId,
		obligationId: obligation._id,
		borrowerId: obligation.borrowerId,
		source: normalizeSource(args.source),
		reason: args.reason,
		metadata: {
			applicationType: "cash_application",
			sourceFamily: sourceAccount.family,
		},
	});
}

// ── Suspense Resolution ──────────────────────────────────────────────

export async function postSuspenseResolution(
	ctx: MutationCtx,
	args: {
		suspenseAccountId: Id<"cash_ledger_accounts">;
		resolution:
			| { type: "match"; obligationId: Id<"obligations">; amount: number }
			| { type: "refund"; amount: number }
			| { type: "write_off"; amount: number };
		sourceEntryId?: Id<"cash_ledger_journal_entries">;
		source: CommandSource;
		reason: string;
		/** Caller-supplied idempotency key — must be stable across retries. */
		idempotencyKey: string;
	}
): Promise<
	| Awaited<ReturnType<typeof postCashEntryInternal>>
	| { type: "refund_requested"; auditLogged: false }
> {
	// 1. Validate suspense account exists and is SUSPENSE family
	const suspenseAccount = await ctx.db.get(args.suspenseAccountId);
	if (!suspenseAccount) {
		throw new ConvexError(
			`Suspense account not found: ${args.suspenseAccountId}`
		);
	}
	if (suspenseAccount.family !== "SUSPENSE") {
		throw new ConvexError(
			`Account must be SUSPENSE family, got ${suspenseAccount.family}`
		);
	}

	// 2. Validate sufficient balance
	const balance = getCashAccountBalance(suspenseAccount);
	if (balance < BigInt(args.resolution.amount)) {
		throw new ConvexError(
			`Insufficient suspense balance: balance=${balance}, requested=${args.resolution.amount}`
		);
	}

	const normalizedSource = normalizeSource(args.source);

	// 3. Handle resolution by type
	if (args.resolution.type === "match") {
		// Suspense match is an admin correction — enforce source
		assertAdminCorrectionSource(normalizedSource);
		// Delegate to postCashApplication — it handles SUSPENSE → BORROWER_RECEIVABLE
		// via SUSPENSE_ESCALATED entry type
		return postCashApplication(ctx, {
			sourceAccountId: args.suspenseAccountId,
			targetObligationId: args.resolution.obligationId,
			amount: args.resolution.amount,
			reason: args.reason,
			sourceEntryId: args.sourceEntryId,
			source: args.source,
			idempotencyKey: args.idempotencyKey,
		});
	}

	if (args.resolution.type === "write_off") {
		// Use CORRECTION entry type (ALL_FAMILIES) to debit WRITE_OFF, credit SUSPENSE
		assertAdminCorrectionSource(normalizedSource);

		// Find or create WRITE_OFF account scoped to the mortgage
		const writeOffAccount = await getOrCreateCashAccount(ctx, {
			family: "WRITE_OFF",
			mortgageId: suspenseAccount.mortgageId,
		});

		// Determine causedBy: use provided sourceEntryId, or find most recent SUSPENSE_ROUTED entry
		let causedBy = args.sourceEntryId;
		if (!causedBy) {
			const recentSuspenseEntry = await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_debit_account_and_timestamp", (q) =>
					q.eq("debitAccountId", args.suspenseAccountId)
				)
				.order("desc")
				.filter((q) => q.eq(q.field("entryType"), "SUSPENSE_ROUTED"))
				.first();
			if (recentSuspenseEntry) {
				causedBy = recentSuspenseEntry._id;
			}
		}

		if (!causedBy) {
			throw new ConvexError(
				"CORRECTION entries must reference causedBy — no sourceEntryId provided and no SUSPENSE_ROUTED entry found"
			);
		}

		return postCashEntryInternal(ctx, {
			entryType: "CORRECTION",
			effectiveDate: unixMsToBusinessDate(Date.now()),
			amount: args.resolution.amount,
			debitAccountId: writeOffAccount._id,
			creditAccountId: args.suspenseAccountId,
			causedBy,
			idempotencyKey: buildIdempotencyKey(
				"suspense-write-off",
				args.suspenseAccountId,
				args.idempotencyKey
			),
			mortgageId: suspenseAccount.mortgageId,
			source: normalizedSource,
			reason: args.reason,
			metadata: {
				resolutionType: "write_off",
				suspenseAccountId: args.suspenseAccountId,
			},
		});
	}

	// refund resolution — intent signal only, no journal entry posted.
	// Audit logging is handled by the mutation layer (resolveSuspenseItem) for consistency
	// with match and write_off paths. A separate process must execute the actual refund.
	return { type: "refund_requested" as const, auditLogged: false as const };
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

// ── Reversal ──────────────────────────────────────────────────────────

/**
 * Tiered payout detection for clawback logic.
 *
 * Searches for a LENDER_PAYOUT_SENT entry linked to a given lender payable
 * entry using progressively broader strategies:
 *   1. dispersalEntryId in obligation-scoped entries
 *   2. dispersalEntryId in lender-scoped entries (legacy payouts without obligationId)
 *   3. postingGroupId from the allocation group
 *   4. lenderId + mortgageId fallback
 */
async function findPayoutEntryForClawback(
	ctx: MutationCtx,
	lenderEntry: Doc<"cash_ledger_journal_entries">,
	lenderId: Id<"lenders">,
	mortgageId: Id<"mortgages">,
	allObligationEntries: Doc<"cash_ledger_journal_entries">[]
): Promise<Doc<"cash_ledger_journal_entries"> | undefined> {
	// Tier 1: match by dispersalEntryId in obligation-scoped entries
	if (lenderEntry.dispersalEntryId) {
		const match = allObligationEntries.find(
			(e) =>
				e.entryType === "LENDER_PAYOUT_SENT" &&
				e.dispersalEntryId === lenderEntry.dispersalEntryId
		);
		if (match) {
			return match;
		}
	}

	// Tier 2: match by dispersalEntryId in lender-scoped entries (payout may
	// not carry obligationId for legacy entries)
	if (lenderEntry.dispersalEntryId) {
		const lenderEntries = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_lender_and_sequence", (q) => q.eq("lenderId", lenderId))
			.collect();
		const match = lenderEntries.find(
			(e) =>
				e.entryType === "LENDER_PAYOUT_SENT" &&
				e.dispersalEntryId === lenderEntry.dispersalEntryId
		);
		if (match) {
			return match;
		}
	}

	// Tier 3: match by postingGroupId from the allocation group (if payout
	// was posted with the same group id as the settlement)
	if (lenderEntry.postingGroupId) {
		const groupEntries = await ctx.db
			.query("cash_ledger_journal_entries")
			.withIndex("by_posting_group", (q) =>
				q.eq("postingGroupId", lenderEntry.postingGroupId as string)
			)
			.collect();
		const match = groupEntries.find(
			(e) => e.entryType === "LENDER_PAYOUT_SENT" && e.lenderId === lenderId
		);
		if (match) {
			return match;
		}
	}

	// Tier 4: broadest fallback — match by lenderId + mortgageId in
	// lender-scoped entries to catch legacy payouts with no dispersalEntryId.
	// Fail closed: if multiple payouts match, return null to surface ambiguity
	// for manual handling instead of risking a wrong clawback attachment.
	const lenderEntries = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_lender_and_sequence", (q) => q.eq("lenderId", lenderId))
		.collect();
	const candidates = lenderEntries.filter(
		(e) => e.entryType === "LENDER_PAYOUT_SENT" && e.mortgageId === mortgageId
	);
	return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Validates that exactly one reversal identifier (attemptId or transferRequestId)
 * is provided. Throws on missing or ambiguous identifiers.
 */
function assertExactlyOneReversalIdentifier(args: {
	attemptId?: Id<"collectionAttempts">;
	transferRequestId?: Id<"transferRequests">;
}):
	| { hasAttemptId: true; hasTransferRequestId: false }
	| { hasAttemptId: false; hasTransferRequestId: true } {
	const hasAttemptId = args.attemptId !== undefined;
	const hasTransferRequestId = args.transferRequestId !== undefined;
	if (!(hasAttemptId || hasTransferRequestId)) {
		throw new ConvexError(
			"postPaymentReversalCascade requires at least one of attemptId or transferRequestId"
		);
	}
	if (hasAttemptId && hasTransferRequestId) {
		throw new ConvexError({
			code: "AMBIGUOUS_REVERSAL_IDENTIFIER" as const,
			attemptId: args.attemptId,
			transferRequestId: args.transferRequestId,
		});
	}
	return { hasAttemptId, hasTransferRequestId: !hasAttemptId } as
		| { hasAttemptId: true; hasTransferRequestId: false }
		| { hasAttemptId: false; hasTransferRequestId: true };
}

/**
 * Reverses an entire settlement's posting group atomically.
 *
 * Given an attempt or transfer request, this function:
 * 1. Reverses the CASH_RECEIVED entry
 * 2. Reverses all LENDER_PAYABLE_CREATED entries from the allocation group
 * 3. Reverses the SERVICING_FEE_RECOGNIZED entry (if any)
 * 4. Reverses LENDER_PAYOUT_SENT entries (if payouts already sent, flagging clawback)
 *
 * All reversal entries share a single postingGroupId for atomicity.
 * Idempotent: re-calling with the same identifiers returns the existing entries.
 */
export async function postPaymentReversalCascade(
	ctx: MutationCtx,
	args: {
		attemptId?: Id<"collectionAttempts">;
		transferRequestId?: Id<"transferRequests">;
		obligationId: Id<"obligations">;
		mortgageId: Id<"mortgages">;
		effectiveDate: string;
		source: CommandSource;
		reason: string;
	}
): Promise<{
	reversalEntries: Doc<"cash_ledger_journal_entries">[];
	postingGroupId: string;
	clawbackRequired: boolean;
}> {
	// 1. Resolve identifier — require exactly one
	const { hasAttemptId } = assertExactlyOneReversalIdentifier(args);

	// 2. Generate postingGroupId from the single provided identifier
	const postingGroupId = hasAttemptId
		? `reversal-group:${args.attemptId}`
		: `reversal-group:transfer:${args.transferRequestId}`;

	// 3. Idempotency check — return existing entries if already posted
	const existingEntries = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_posting_group", (q) =>
			q.eq("postingGroupId", postingGroupId)
		)
		.collect();

	if (existingEntries.length > 0) {
		const clawbackRequired = existingEntries.some((e) =>
			e.idempotencyKey.includes("payout-clawback")
		);
		return {
			reversalEntries: existingEntries,
			postingGroupId,
			clawbackRequired,
		};
	}

	// 4. Find original CASH_RECEIVED entry
	const allObligationEntries = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_obligation_and_sequence", (q) =>
			q.eq("obligationId", args.obligationId)
		)
		.collect();

	const cashReceivedEntry = allObligationEntries.find(
		(e) =>
			e.entryType === "CASH_RECEIVED" &&
			(args.attemptId
				? e.attemptId === args.attemptId
				: e.transferRequestId === args.transferRequestId)
	);

	if (!cashReceivedEntry) {
		throw new ConvexError({
			code: "ORIGINAL_ENTRY_NOT_FOUND" as const,
			message: "No CASH_RECEIVED entry found for the given identifiers",
			attemptId: args.attemptId ?? null,
			transferRequestId: args.transferRequestId ?? null,
			obligationId: args.obligationId,
		});
	}

	// 5. Validate dimension consistency — args dimensions must match the
	// original entry to prevent mis-attributed reversals in queries/indexes.
	assertDimensionMatch(cashReceivedEntry, {
		mortgageId: args.mortgageId,
		obligationId: args.obligationId,
	});

	// 6. Identifier string for idempotency keys
	// Exactly one of attemptId/transferRequestId is guaranteed by step 1 validation
	const identifier = args.attemptId ?? (args.transferRequestId as string);

	// 7. Validate reversal amount is a safe integer (renumbered after dimension check)
	const cashReceivedAmount = safeBigintToNumber(cashReceivedEntry.amount);
	assertReversalAmountValid(
		cashReceivedAmount,
		cashReceivedEntry.amount,
		"CASH_RECEIVED"
	);

	// 8. Reverse CASH_RECEIVED
	await postCashEntryInternal(ctx, {
		entryType: "REVERSAL",
		effectiveDate: args.effectiveDate,
		amount: cashReceivedAmount,
		debitAccountId: cashReceivedEntry.creditAccountId,
		creditAccountId: cashReceivedEntry.debitAccountId,
		causedBy: cashReceivedEntry._id,
		postingGroupId,
		idempotencyKey: buildIdempotencyKey(
			"reversal",
			"cash-received",
			identifier
		),
		mortgageId: args.mortgageId,
		obligationId: args.obligationId,
		attemptId: args.attemptId,
		transferRequestId: args.transferRequestId,
		borrowerId: cashReceivedEntry.borrowerId,
		source: normalizeSource(args.source),
		reason: args.reason,
	});

	// 9. Find original allocation entries from the settlement posting group
	const allocationGroupId = `allocation:${args.obligationId}`;
	const allocationEntries = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_posting_group", (q) =>
			q.eq("postingGroupId", allocationGroupId)
		)
		.collect();

	const lenderPayableEntries = allocationEntries.filter(
		(e) => e.entryType === "LENDER_PAYABLE_CREATED"
	);
	const servicingFeeEntry = allocationEntries.find(
		(e) => e.entryType === "SERVICING_FEE_RECOGNIZED"
	);

	// 10. Reverse each LENDER_PAYABLE_CREATED
	for (const entry of lenderPayableEntries) {
		await postCashEntryInternal(ctx, {
			entryType: "REVERSAL",
			effectiveDate: args.effectiveDate,
			amount: safeBigintToNumber(entry.amount),
			debitAccountId: entry.creditAccountId,
			creditAccountId: entry.debitAccountId,
			causedBy: entry._id,
			postingGroupId,
			idempotencyKey: buildIdempotencyKey(
				"reversal",
				"lender-payable",
				entry.dispersalEntryId ?? entry._id
			),
			mortgageId: args.mortgageId,
			obligationId: args.obligationId,
			lenderId: entry.lenderId,
			borrowerId: entry.borrowerId,
			dispersalEntryId: entry.dispersalEntryId,
			source: normalizeSource(args.source),
			reason: args.reason,
		});
	}

	// 11. Reverse SERVICING_FEE_RECOGNIZED (if exists)
	if (servicingFeeEntry) {
		await postCashEntryInternal(ctx, {
			entryType: "REVERSAL",
			effectiveDate: args.effectiveDate,
			amount: safeBigintToNumber(servicingFeeEntry.amount),
			debitAccountId: servicingFeeEntry.creditAccountId,
			creditAccountId: servicingFeeEntry.debitAccountId,
			causedBy: servicingFeeEntry._id,
			postingGroupId,
			idempotencyKey: buildIdempotencyKey(
				"reversal",
				"servicing-fee",
				args.obligationId
			),
			mortgageId: args.mortgageId,
			obligationId: args.obligationId,
			borrowerId: servicingFeeEntry.borrowerId,
			source: normalizeSource(args.source),
			reason: args.reason,
		});
	}

	// 12. Check for and reverse LENDER_PAYOUT_SENT (conditional clawback)
	let clawbackRequired = false;

	for (const lenderEntry of lenderPayableEntries) {
		const currentLenderId = lenderEntry.lenderId;
		if (!currentLenderId) {
			continue;
		}

		const payoutEntry = await findPayoutEntryForClawback(
			ctx,
			lenderEntry,
			currentLenderId,
			args.mortgageId,
			allObligationEntries
		);

		if (payoutEntry) {
			clawbackRequired = true;
			await postCashEntryInternal(ctx, {
				entryType: "REVERSAL",
				effectiveDate: args.effectiveDate,
				amount: safeBigintToNumber(payoutEntry.amount),
				debitAccountId: payoutEntry.creditAccountId,
				creditAccountId: payoutEntry.debitAccountId,
				causedBy: payoutEntry._id,
				postingGroupId,
				idempotencyKey: buildIdempotencyKey(
					"reversal",
					"payout-clawback",
					currentLenderId,
					identifier
				),
				mortgageId: args.mortgageId,
				obligationId: args.obligationId,
				lenderId: currentLenderId,
				source: normalizeSource(args.source),
				reason: args.reason,
			});
		}
	}

	// 13. Collect all reversal entries and emit audit log
	const reversalEntries = await ctx.db
		.query("cash_ledger_journal_entries")
		.withIndex("by_posting_group", (q) =>
			q.eq("postingGroupId", postingGroupId)
		)
		.collect();

	// 14. Audit log for the cascade operation (compliance: O.Reg 189/08)
	await auditLog.log(ctx, {
		action: "cashLedger.reversal_cascade",
		actorId: args.source.actorId ?? "system",
		resourceType: "obligation",
		resourceId: args.obligationId,
		severity: "warning",
		metadata: {
			postingGroupId,
			clawbackRequired,
			entryCount: reversalEntries.length,
			attemptId: args.attemptId ?? null,
			transferRequestId: args.transferRequestId ?? null,
			reason: args.reason,
		},
	});

	return { reversalEntries, postingGroupId, clawbackRequired };
}

/**
 * Single-entry reversal for transfer-backed payments.
 *
 * Loads the original journal entry, validates the reversal amount does not
 * exceed the original, and posts a REVERSAL with swapped debit/credit accounts.
 */
export async function postTransferReversal(
	ctx: MutationCtx,
	args: {
		transferRequestId: Id<"transferRequests">;
		originalEntryId: Id<"cash_ledger_journal_entries">;
		amount: number;
		effectiveDate: string;
		source: CommandSource;
		reason: string;
	}
): Promise<{ entry: Doc<"cash_ledger_journal_entries"> }> {
	// 1. Load original entry
	const original = await ctx.db.get(args.originalEntryId);
	if (!original) {
		throw new ConvexError(`Original entry not found: ${args.originalEntryId}`);
	}

	// 2. Validate transferRequestId consistency — the original entry must be
	// a transfer-backed entry (i.e. it must carry a transferRequestId) and
	// that id must match the one supplied by the caller.
	if (!original.transferRequestId) {
		throw new ConvexError({
			code: "NOT_A_TRANSFER_ENTRY" as const,
			message:
				"Cannot create a transfer-scoped reversal for a non-transfer entry",
			originalEntryId: args.originalEntryId,
			originalEntryType: original.entryType,
		});
	}
	if (original.transferRequestId !== args.transferRequestId) {
		throw new ConvexError({
			code: "TRANSFER_REQUEST_MISMATCH" as const,
			originalTransferRequestId: original.transferRequestId,
			providedTransferRequestId: args.transferRequestId,
		});
	}

	// 3. Validate reversal amount
	assertReversalAmountValid(args.amount, original.amount, "transfer reversal");

	// 4. Post REVERSAL with swapped accounts
	const result = await postCashEntryInternal(ctx, {
		entryType: "REVERSAL",
		effectiveDate: args.effectiveDate,
		amount: args.amount,
		debitAccountId: original.creditAccountId,
		creditAccountId: original.debitAccountId,
		causedBy: original._id,
		idempotencyKey: buildIdempotencyKey(
			"reversal",
			"transfer",
			args.transferRequestId
		),
		mortgageId: original.mortgageId,
		obligationId: original.obligationId,
		transferRequestId: args.transferRequestId,
		lenderId: original.lenderId,
		borrowerId: original.borrowerId,
		dispersalEntryId: original.dispersalEntryId,
		source: normalizeSource(args.source),
		reason: args.reason,
	});

	return { entry: result.entry };
}

// ── Transfer-backed Cash Posting ─────────────────────────────────

/**
 * Maps an inbound transfer type to the credit account family.
 *
 * - borrower_interest_collection, borrower_principal_collection,
 *   borrower_late_fee_collection, borrower_arrears_cure → BORROWER_RECEIVABLE
 * - locking_fee_collection, commitment_deposit_collection → UNAPPLIED_CASH
 * - deal_principal_transfer → CASH_CLEARING
 */
export function inboundTransferCreditFamily(
	transferType: string | undefined
): CashAccountFamily {
	switch (transferType) {
		case "borrower_interest_collection":
		case "borrower_principal_collection":
		case "borrower_late_fee_collection":
		case "borrower_arrears_cure":
			return "BORROWER_RECEIVABLE";
		case "locking_fee_collection":
		case "commitment_deposit_collection":
			return "UNAPPLIED_CASH";
		case "deal_principal_transfer":
			return "CASH_CLEARING";
		default:
			// Defensive default — route unknown types to UNAPPLIED_CASH so
			// the entry is journaled and discoverable for manual resolution.
			return "UNAPPLIED_CASH";
	}
}

/**
 * Posts a CASH_RECEIVED journal entry for an inbound transfer.
 *
 * Debit: TRUST_CASH, Credit: mapped from transfer type.
 * Idempotency: `cash-ledger:cash-received:transfer:{transferRequestId}`
 */
export async function postCashReceiptForTransfer(
	ctx: MutationCtx,
	args: {
		transferRequestId: Id<"transferRequests">;
		source: CommandSource;
	}
): Promise<Doc<"cash_ledger_journal_entries">> {
	const transfer = await ctx.db.get(args.transferRequestId);
	if (!transfer) {
		throw new ConvexError(
			`Transfer request not found: ${args.transferRequestId}`
		);
	}
	if (!(transfer.amount && Number.isSafeInteger(transfer.amount))) {
		throw new ConvexError(
			`Transfer ${args.transferRequestId} has no valid amount`
		);
	}
	if (!transfer.mortgageId) {
		throw new ConvexError(
			`Transfer ${args.transferRequestId} has no mortgageId`
		);
	}

	const creditFamily = inboundTransferCreditFamily(transfer.transferType);

	if (creditFamily === "BORROWER_RECEIVABLE" && !transfer.obligationId) {
		throw new ConvexError(
			`Transfer ${args.transferRequestId} requires an obligationId for receivable-backed transfer type "${transfer.transferType}"`
		);
	}

	const trustCashAccount = await getOrCreateCashAccount(ctx, {
		family: "TRUST_CASH",
		mortgageId: transfer.mortgageId,
	});

	const creditAccountArgs: Parameters<typeof getOrCreateCashAccount>[1] =
		creditFamily === "BORROWER_RECEIVABLE" && transfer.obligationId
			? {
					family: "BORROWER_RECEIVABLE",
					mortgageId: transfer.mortgageId,
					obligationId: transfer.obligationId,
					borrowerId: transfer.borrowerId ?? undefined,
				}
			: {
					family: creditFamily,
					mortgageId: transfer.mortgageId,
				};

	const creditAccount = await getOrCreateCashAccount(ctx, creditAccountArgs);

	const result = await postCashEntryInternal(ctx, {
		entryType: "CASH_RECEIVED",
		effectiveDate: unixMsToBusinessDate(transfer.settledAt ?? Date.now()),
		amount: transfer.amount,
		debitAccountId: trustCashAccount._id,
		creditAccountId: creditAccount._id,
		idempotencyKey: buildIdempotencyKey(
			"cash-received",
			"transfer",
			args.transferRequestId
		),
		mortgageId: transfer.mortgageId,
		obligationId: transfer.obligationId,
		transferRequestId: args.transferRequestId,
		borrowerId: transfer.borrowerId,
		lenderId: transfer.lenderId,
		dealId: transfer.dealId,
		dispersalEntryId: transfer.dispersalEntryId,
		source: normalizeSource(args.source),
		metadata: {
			transferType: transfer.transferType,
			direction: transfer.direction,
		},
	});

	return result.entry;
}

/**
 * Posts a LENDER_PAYOUT_SENT journal entry for an outbound transfer.
 *
 * Debit: LENDER_PAYABLE, Credit: TRUST_CASH.
 * Idempotency: `cash-ledger:lender-payout-sent:transfer:{transferRequestId}`
 */
export async function postLenderPayoutForTransfer(
	ctx: MutationCtx,
	args: {
		transferRequestId: Id<"transferRequests">;
		source: CommandSource;
	}
): Promise<Doc<"cash_ledger_journal_entries">> {
	const transfer = await ctx.db.get(args.transferRequestId);
	if (!transfer) {
		throw new ConvexError(
			`Transfer request not found: ${args.transferRequestId}`
		);
	}
	if (!(transfer.amount && Number.isSafeInteger(transfer.amount))) {
		throw new ConvexError(
			`Transfer ${args.transferRequestId} has no valid amount`
		);
	}
	if (!transfer.mortgageId) {
		throw new ConvexError(
			`Transfer ${args.transferRequestId} has no mortgageId`
		);
	}
	if (!transfer.lenderId) {
		throw new ConvexError(
			`Transfer ${args.transferRequestId} has no lenderId for lender payout`
		);
	}

	const lenderPayableAccount = await getOrCreateCashAccount(ctx, {
		family: "LENDER_PAYABLE",
		mortgageId: transfer.mortgageId,
		lenderId: transfer.lenderId,
	});

	const trustCashAccount = await getOrCreateCashAccount(ctx, {
		family: "TRUST_CASH",
		mortgageId: transfer.mortgageId,
	});

	const result = await postCashEntryInternal(ctx, {
		entryType: "LENDER_PAYOUT_SENT",
		effectiveDate: unixMsToBusinessDate(transfer.settledAt ?? Date.now()),
		amount: transfer.amount,
		debitAccountId: lenderPayableAccount._id,
		creditAccountId: trustCashAccount._id,
		idempotencyKey: buildIdempotencyKey(
			"lender-payout-sent",
			"transfer",
			args.transferRequestId
		),
		mortgageId: transfer.mortgageId,
		transferRequestId: args.transferRequestId,
		lenderId: transfer.lenderId,
		borrowerId: transfer.borrowerId,
		dealId: transfer.dealId,
		dispersalEntryId: transfer.dispersalEntryId,
		source: normalizeSource(args.source),
		metadata: {
			transferType: transfer.transferType,
			direction: transfer.direction,
		},
	});

	return result.entry;
}
