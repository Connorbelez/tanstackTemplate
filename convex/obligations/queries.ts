import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Returns the most recent settled obligation before a given date for a mortgage.
 * Uses by_mortgage_and_due index range to avoid full-table scan.
 */
export const getSettledBeforeDate = internalQuery({
	args: {
		mortgageId: v.id("mortgages"),
		beforeDate: v.string(),
	},
	handler: async (ctx, { mortgageId, beforeDate }) => {
		return await ctx.db
			.query("obligations")
			.withIndex("by_mortgage_and_due", (q) =>
				q.eq("mortgageId", mortgageId).lte("dueDate", beforeDate)
			)
			.order("desc")
			.filter((q) => q.eq(q.field("status"), "settled"))
			.first();
	},
});

/**
 * Returns the first obligation after a given date for a mortgage.
 * Uses by_mortgage_and_due index range to avoid full-table scan.
 */
export const getFirstAfterDate = internalQuery({
	args: {
		mortgageId: v.id("mortgages"),
		afterDate: v.string(),
	},
	handler: async (ctx, { mortgageId, afterDate }) => {
		return await ctx.db
			.query("obligations")
			.withIndex("by_mortgage_and_due", (q) =>
				q.eq("mortgageId", mortgageId).gt("dueDate", afterDate)
			)
			.order("asc")
			.first();
	},
});
