import { ConvexError, v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { generateObligationsImpl } from "./generateImpl";

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

		// 4. Delegate to shared implementation
		return generateObligationsImpl(ctx, {
			mortgageId: args.mortgageId,
			borrowerId: borrowerLink.borrowerId,
			interestRate: mortgage.interestRate,
			principal: mortgage.principal,
			paymentFrequency: mortgage.paymentFrequency,
			firstPaymentDate: mortgage.firstPaymentDate,
			maturityDate: mortgage.maturityDate,
		});
	},
});
