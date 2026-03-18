import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Returns the most recent settled obligation before a given date for a mortgage.
 * Used by prorateAccrualBetweenOwners to derive the last payment date.
 */
export const getSettledBeforeDate = internalQuery({
	args: {
		mortgageId: v.id("mortgages"),
		beforeDate: v.string(),
	},
	handler: async (ctx, { mortgageId, beforeDate }) => {
		const obligations = await ctx.db
			.query("obligations")
			.withIndex("by_mortgage_and_due", (q) => q.eq("mortgageId", mortgageId))
			.filter((q) =>
				q.and(
					q.lte(q.field("dueDate"), beforeDate),
					q.eq(q.field("status"), "settled")
				)
			)
			.collect();

		// Sort descending by dueDate to get the most recent
		obligations.sort((a, b) => (b.dueDate > a.dueDate ? 1 : -1));
		return obligations.length > 0 ? obligations[0] : null;
	},
});

/**
 * Returns the first obligation after a given date for a mortgage.
 * Used by prorateAccrualBetweenOwners to derive the next payment date.
 */
export const getFirstAfterDate = internalQuery({
	args: {
		mortgageId: v.id("mortgages"),
		afterDate: v.string(),
	},
	handler: async (ctx, { mortgageId, afterDate }) => {
		const obligations = await ctx.db
			.query("obligations")
			.withIndex("by_mortgage_and_due", (q) => q.eq("mortgageId", mortgageId))
			.filter((q) => q.gt(q.field("dueDate"), afterDate))
			.collect();

		// Sort ascending by dueDate to get the earliest
		obligations.sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1));
		return obligations.length > 0 ? obligations[0] : null;
	},
});
