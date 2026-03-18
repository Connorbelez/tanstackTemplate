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

/**
 * Returns the first non-settled obligation on or after a given date for a mortgage.
 * Uses `gte` to include obligations exactly on the boundary date, and filters
 * to non-settled status so settled obligations on the boundary are skipped.
 * Used by prorate calculations where closing on a payment date should
 * yield 0 buyer days rather than failing to find a next payment boundary.
 * Uses by_mortgage_and_due index range to avoid full-table scan.
 */
export const getFirstOnOrAfterDate = internalQuery({
	args: {
		mortgageId: v.id("mortgages"),
		onOrAfterDate: v.string(),
	},
	handler: async (ctx, { mortgageId, onOrAfterDate }) => {
		return await ctx.db
			.query("obligations")
			.withIndex("by_mortgage_and_due", (q) =>
				q.eq("mortgageId", mortgageId).gte("dueDate", onOrAfterDate)
			)
			.order("asc")
			.filter((q) => q.neq(q.field("status"), "settled"))
			.first();
	},
});
