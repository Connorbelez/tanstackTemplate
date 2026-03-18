import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Creates a new obligation record.
 * Used by rules engine (e.g. LateFeeeRule) and admin seeding to insert
 * obligations such as late fees or arrears cures.
 */
export const createObligation = internalMutation({
	args: {
		mortgageId: v.id("mortgages"),
		borrowerId: v.id("borrowers"),
		paymentNumber: v.number(),
		type: v.union(
			v.literal("regular_interest"),
			v.literal("arrears_cure"),
			v.literal("late_fee"),
			v.literal("principal_repayment")
		),
		amount: v.number(),
		amountSettled: v.number(),
		dueDate: v.number(),
		gracePeriodEnd: v.number(),
		sourceObligationId: v.optional(v.id("obligations")),
		status: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("obligations", {
			mortgageId: args.mortgageId,
			borrowerId: args.borrowerId,
			paymentNumber: args.paymentNumber,
			type: args.type,
			amount: args.amount,
			amountSettled: args.amountSettled,
			dueDate: args.dueDate,
			gracePeriodEnd: args.gracePeriodEnd,
			sourceObligationId: args.sourceObligationId,
			status: args.status,
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
			machineContext: undefined,
			settledAt: undefined,
		});
	},
});
