import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

export interface DisbursementValidationResult {
	allowed: boolean;
	availableBalance: number; // cents, safe integer
	reason?: string;
	requestedAmount: number;
}

/**
 * Pre-initiation guard: validates that a disbursement amount does not
 * exceed the lender's available payable balance.
 *
 * Called by Unified Payment Rails BEFORE initiating a payout transfer.
 * Cash Ledger is the source of truth; the rails check against it.
 *
 * @example
 * const result = await validateDisbursementAmount(ctx, {
 *   lenderId,
 *   requestedAmount: transferRequest.amount,
 * });
 * if (!result.allowed) {
 *   throw new Error(`Disbursement rejected: ${result.reason}`);
 * }
 */
export async function validateDisbursementAmount(
	ctx: QueryCtx,
	args: {
		lenderId: Id<"lenders">;
		requestedAmount: number; // cents
	}
): Promise<DisbursementValidationResult> {
	const result = await ctx.runQuery(
		internal.payments.cashLedger.queries
			.getAvailableLenderPayableBalanceInternal,
		{ lenderId: args.lenderId }
	);

	const available = result.availableBalance;

	if (args.requestedAmount > available) {
		return {
			allowed: false,
			availableBalance: available,
			requestedAmount: args.requestedAmount,
			reason: `Disbursement of ${args.requestedAmount} exceeds available balance of ${available}`,
		};
	}

	return {
		allowed: true,
		availableBalance: available,
		requestedAmount: args.requestedAmount,
	};
}

/**
 * Throwing variant — convenience for callers that want hard failure.
 *
 * @throws ConvexError with code "DISBURSEMENT_EXCEEDS_PAYABLE"
 *         containing { lenderId, requestedAmount, availableBalance }
 */
export async function assertDisbursementAllowed(
	ctx: QueryCtx,
	args: {
		lenderId: Id<"lenders">;
		requestedAmount: number; // cents
	}
): Promise<void> {
	const result = await validateDisbursementAmount(ctx, args);
	if (!result.allowed) {
		throw new ConvexError({
			code: "DISBURSEMENT_EXCEEDS_PAYABLE" as const,
			requestedAmount: args.requestedAmount,
			availableBalance: result.availableBalance,
			lenderId: args.lenderId,
		});
	}
}
