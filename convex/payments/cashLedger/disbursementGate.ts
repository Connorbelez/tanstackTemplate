import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { safeBigintToNumber } from "./accounts";
import { getAvailableLenderPayableBalanceImpl } from "./queries";

// ── Discriminated union: allowed/rejected are distinct type branches ──

interface DisbursementResultBase {
	availableBalance: number;
	requestedAmount: number;
}

export interface DisbursementAllowed extends DisbursementResultBase {
	allowed: true;
}

export interface DisbursementRejected extends DisbursementResultBase {
	allowed: false;
	reason: string;
}

export type DisbursementValidationResult =
	| DisbursementAllowed
	| DisbursementRejected;

/**
 * Pre-initiation guard: validates that a disbursement amount does not
 * exceed the lender's available payable balance.
 *
 * Called BEFORE a transfer is initiated with the payment provider.
 * First line of defense. The posting-time constraint (ENG-162, REQ-251)
 * is the second.
 *
 * @throws ConvexError with code INVALID_DISBURSEMENT_AMOUNT if requestedAmount
 *         is non-positive, NaN, or Infinity.
 */
export async function validateDisbursementAmount(
	ctx: { db: QueryCtx["db"] },
	args: {
		lenderId: Id<"lenders">;
		requestedAmount: number;
	}
): Promise<DisbursementValidationResult> {
	if (!Number.isFinite(args.requestedAmount) || args.requestedAmount <= 0) {
		throw new ConvexError({
			code: "INVALID_DISBURSEMENT_AMOUNT" as const,
			requestedAmount: args.requestedAmount,
			lenderId: args.lenderId,
		});
	}

	const result = await getAvailableLenderPayableBalanceImpl(ctx, args.lenderId);
	const availableBalance = safeBigintToNumber(result.availableBalance);

	if (args.requestedAmount > availableBalance) {
		return {
			allowed: false,
			availableBalance,
			requestedAmount: args.requestedAmount,
			reason:
				availableBalance < 0
					? `Disbursement blocked: in-flight transfers exceed gross payable balance (available: 0, over-committed by ${Math.abs(availableBalance)})`
					: `Disbursement of ${args.requestedAmount} exceeds available payable balance of ${availableBalance}`,
		};
	}

	return {
		allowed: true,
		availableBalance,
		requestedAmount: args.requestedAmount,
	};
}

/**
 * Throwing variant — convenience for callers that want hard failure.
 * Wraps unexpected errors with disbursement-gate context.
 */
export async function assertDisbursementAllowed(
	ctx: { db: QueryCtx["db"] },
	args: {
		lenderId: Id<"lenders">;
		requestedAmount: number;
	}
): Promise<void> {
	let result: DisbursementValidationResult;
	try {
		result = await validateDisbursementAmount(ctx, args);
	} catch (e) {
		if (e instanceof ConvexError) {
			throw e;
		}
		throw new Error(
			`Disbursement gate failed for lender ${args.lenderId}: ${e instanceof Error ? e.message : String(e)}`
		);
	}
	if (!result.allowed) {
		throw new ConvexError({
			code: "DISBURSEMENT_EXCEEDS_PAYABLE" as const,
			requestedAmount: args.requestedAmount,
			availableBalance: result.availableBalance,
			lenderId: args.lenderId,
		});
	}
}
