import { ConvexError, v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalMutation } from "../../_generated/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERIODS_PER_YEAR: Record<string, number> = {
	monthly: 12,
	bi_weekly: 26,
	accelerated_bi_weekly: 26,
	weekly: 52,
};

const GRACE_PERIOD_DAYS = 15;

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Advances a date by one month, clamping to the last day of the target month
 * to avoid the JS `setMonth` overflow problem (e.g. Jan 31 -> Mar 3).
 */
function advanceMonth(date: Date): Date {
	const result = new Date(date);
	const targetMonth = result.getMonth() + 1;
	result.setMonth(targetMonth);
	// If we overshot (e.g., Jan 31 → Mar 3), clamp to last day of target month
	if (result.getMonth() !== targetMonth % 12) {
		result.setDate(0); // last day of previous month
	}
	return result;
}

// ---------------------------------------------------------------------------
// generateObligations — internalMutation
// ---------------------------------------------------------------------------

export const generateObligations = internalMutation({
	args: {
		mortgageId: v.id("mortgages"),
	},
	handler: async (ctx, args) => {
		// 1. Load mortgage
		const mortgage = await ctx.db.get(args.mortgageId);
		if (!mortgage) {
			throw new ConvexError(`Mortgage not found: ${args.mortgageId as string}`);
		}

		// 2. Idempotency check — if obligations already exist, skip
		const existing = await ctx.db
			.query("obligations")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.first();

		if (existing) {
			return { generated: 0, obligations: [], skipped: true };
		}

		// 3. Resolve borrower from mortgageBorrowers join table
		const borrowerLink = await ctx.db
			.query("mortgageBorrowers")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", args.mortgageId))
			.first();

		if (!borrowerLink) {
			throw new ConvexError(
				`No borrower found for mortgage: ${args.mortgageId as string}`
			);
		}

		const borrowerId = borrowerLink.borrowerId;

		// 4. Parse dates (ISO strings → timestamps)
		const firstPaymentTs = new Date(mortgage.firstPaymentDate).getTime();
		const maturityTs = new Date(mortgage.maturityDate).getTime();

		// 5. Calculate period amount (interest-only, in cents)
		const periodsPerYear = PERIODS_PER_YEAR[mortgage.paymentFrequency];
		if (!periodsPerYear) {
			throw new ConvexError(
				`Unknown payment frequency: ${mortgage.paymentFrequency}`
			);
		}
		const periodAmount = Math.round(
			(mortgage.interestRate * mortgage.principal) / periodsPerYear
		);

		// 6. Generate obligations from firstPaymentDate to maturityDate (inclusive)
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
				mortgageId: args.mortgageId,
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

			obligations.push(id);
			index++;

			// Advance to next period
			if (mortgage.paymentFrequency === "monthly") {
				currentDate = advanceMonth(currentDate);
			} else if (
				mortgage.paymentFrequency === "bi_weekly" ||
				mortgage.paymentFrequency === "accelerated_bi_weekly"
			) {
				currentDate = new Date(currentDate.getTime() + 14 * MS_PER_DAY);
			} else {
				// weekly
				currentDate = new Date(currentDate.getTime() + 7 * MS_PER_DAY);
			}
		}

		return { generated: obligations.length, obligations };
	},
});
