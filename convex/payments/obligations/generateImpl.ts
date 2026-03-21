import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
	type PaymentFrequency,
	getPeriodsPerYear,
} from "../../mortgages/paymentFrequency";
import { postObligationAccrued } from "../cashLedger/integrations";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GRACE_PERIOD_DAYS = 15;

export const MS_PER_DAY = 86_400_000;

const CASH_LEDGER_SYSTEM_SOURCE = {
	channel: "scheduler" as const,
	actorId: "system",
	actorType: "system" as const,
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Advances a date by one month, clamping to the last day of the target month
 * to avoid the JS `setMonth` overflow problem (e.g. Jan 31 -> Mar 3).
 */
export function advanceMonth(date: Date): Date {
	const result = new Date(date);
	const targetMonth = result.getMonth() + 1;
	result.setMonth(targetMonth);
	// If we overshot (e.g., Jan 31 -> Mar 3), clamp to last day of target month
	if (result.getMonth() !== targetMonth % 12) {
		result.setDate(0); // last day of previous month
	}
	return result;
}

// ---------------------------------------------------------------------------
// Shared generation logic
// ---------------------------------------------------------------------------

export interface GenerateObligationsParams {
	borrowerId: Id<"borrowers">;
	borrowerRole?: "primary" | "secondary"; // Optional role for deterministic ownership
	firstPaymentDate: string; // ISO date string
	interestRate: number;
	maturityDate: string; // ISO date string
	mortgageId: Id<"mortgages">;
	paymentFrequency: PaymentFrequency;
	principal: number;
}

/**
 * Pure obligation generation loop. Creates obligations from firstPaymentDate
 * to maturityDate based on the payment frequency. Caller is responsible for
 * idempotency checks and loading mortgage/borrower data.
 */
export async function generateObligationsImpl(
	ctx: MutationCtx,
	params: GenerateObligationsParams
): Promise<{ generated: number; obligations: Id<"obligations">[] }> {
	const {
		mortgageId,
		borrowerId,
		borrowerRole: _borrowerRole,
		interestRate,
		principal,
		paymentFrequency,
		firstPaymentDate,
		maturityDate,
	} = params;

	// Parse dates (ISO strings -> timestamps)
	const firstPaymentTs = new Date(firstPaymentDate).getTime();
	const maturityTs = new Date(maturityDate).getTime();

	// Validate parsed timestamps
	if (!(Number.isFinite(firstPaymentTs) && Number.isFinite(maturityTs))) {
		throw new ConvexError(
			`Invalid date format: firstPaymentDate (${firstPaymentDate}) or maturityDate (${maturityDate}) is not a valid ISO date string`
		);
	}

	// Reject inverted schedules before entering the loop
	if (firstPaymentTs > maturityTs) {
		throw new ConvexError(
			`Invalid schedule: firstPaymentDate (${firstPaymentDate}) cannot be after maturityDate (${maturityDate})`
		);
	}

	// Calculate period amount (interest-only, in cents)
	let periodsPerYear: number;
	try {
		periodsPerYear = getPeriodsPerYear(paymentFrequency);
	} catch {
		throw new ConvexError(`Unknown payment frequency: ${paymentFrequency}`);
	}
	const periodAmount = Math.round((interestRate * principal) / periodsPerYear);

	// Generate obligations from firstPaymentDate to maturityDate (inclusive)
	const obligations: Id<"obligations">[] = [];
	let currentDate = new Date(firstPaymentTs);
	let index = 0;

	while (currentDate.getTime() <= maturityTs) {
		const currentTimestamp = currentDate.getTime();
		const now = Date.now();

		const id = await ctx.db.insert("obligations", {
			status: "upcoming",
			machineContext: { obligationId: "", paymentsApplied: 0 },
			lastTransitionAt: now,
			mortgageId,
			borrowerId,
			paymentNumber: index + 1,
			type: "regular_interest",
			amount: periodAmount,
			amountSettled: 0,
			dueDate: currentTimestamp,
			gracePeriodEnd: currentTimestamp + GRACE_PERIOD_DAYS * MS_PER_DAY,
			createdAt: now,
		});

		// Patch machineContext with actual obligation ID
		await ctx.db.patch(id, {
			machineContext: { obligationId: id, paymentsApplied: 0 },
		});

		// Only post accruals for obligations that are due (or past due) as of now.
		// Future-dated upcoming obligations will be accrued later when they
		// transition to due via the BECAME_DUE transition.
		if (currentTimestamp <= now) {
			await postObligationAccrued(ctx, {
				obligationId: id,
				source: CASH_LEDGER_SYSTEM_SOURCE,
			});
		}

		obligations.push(id);
		index++;

		// Advance to next period
		if (paymentFrequency === "monthly") {
			currentDate = advanceMonth(currentDate);
		} else if (
			paymentFrequency === "bi_weekly" ||
			paymentFrequency === "accelerated_bi_weekly"
		) {
			currentDate = new Date(currentDate.getTime() + 14 * MS_PER_DAY);
		} else {
			// weekly
			currentDate = new Date(currentDate.getTime() + 7 * MS_PER_DAY);
		}
	}

	return { generated: obligations.length, obligations };
}
