import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import type { CommandSource } from "../../engine/types";
import { findCashAccount, getOrCreateCashAccount } from "./accounts";
import { postCashEntryInternal } from "./postEntry";
import { buildIdempotencyKey } from "./types";

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
	}
) {
	const obligation = await ctx.db.get(args.obligationId);
	if (!obligation) {
		throw new ConvexError(`Obligation not found: ${args.obligationId}`);
	}

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
