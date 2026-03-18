import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Returns the most recent settled obligation before a given date for a mortgage.
 * Uses by_mortgage_and_date index range to avoid full-table scan.
 */
export const getSettledBeforeDate = internalQuery({
	args: {
		mortgageId: v.id("mortgages"),
		beforeDate: v.number(), // unix timestamp
	},
	handler: async (ctx, { mortgageId, beforeDate }) => {
		return await ctx.db
			.query("obligations")
			.withIndex("by_mortgage_and_date", (q) =>
				q.eq("mortgageId", mortgageId).lte("dueDate", beforeDate)
			)
			.order("desc")
			.filter((q) => q.eq(q.field("status"), "settled"))
			.first();
	},
});

/**
 * Returns the first obligation after a given date for a mortgage.
 * Uses by_mortgage_and_date index range to avoid full-table scan.
 */
export const getFirstAfterDate = internalQuery({
	args: {
		mortgageId: v.id("mortgages"),
		afterDate: v.number(), // unix timestamp
	},
	handler: async (ctx, { mortgageId, afterDate }) => {
		return await ctx.db
			.query("obligations")
			.withIndex("by_mortgage_and_date", (q) =>
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
 * Uses by_mortgage_and_date index range to avoid full-table scan.
 */
export const getFirstOnOrAfterDate = internalQuery({
	args: {
		mortgageId: v.id("mortgages"),
		onOrAfterDate: v.number(), // unix timestamp
	},
	handler: async (ctx, { mortgageId, onOrAfterDate }) => {
		return await ctx.db
			.query("obligations")
			.withIndex("by_mortgage_and_date", (q) =>
				q.eq("mortgageId", mortgageId).gte("dueDate", onOrAfterDate)
			)
			.order("asc")
			.filter((q) => q.neq(q.field("status"), "settled"))
			.first();
	},
});

/**
 * Returns all obligations with status "upcoming" that are due on or before a given date.
 * Optionally scoped to a single mortgage.
 */
export const getUpcomingInWindow = internalQuery({
	args: {
		mortgageId: v.optional(v.id("mortgages")),
		dueBefore: v.number(), // unix timestamp
	},
	handler: async (ctx, { mortgageId, dueBefore }) => {
		if (mortgageId) {
			return await ctx.db
				.query("obligations")
				.withIndex("by_mortgage_and_date", (q) =>
					q.eq("mortgageId", mortgageId).lte("dueDate", dueBefore)
				)
				.filter((q) => q.eq(q.field("status"), "upcoming"))
				.collect();
		}
		return await ctx.db
			.query("obligations")
			.withIndex("by_due_date", (q) =>
				q.eq("status", "upcoming").lte("dueDate", dueBefore)
			)
			.collect();
	},
});

/**
 * Returns a single obligation by its ID.
 * Used by rules engine (e.g. LateFeeRule) to load source obligation data.
 */
export const getById = internalQuery({
	args: { id: v.id("obligations") },
	handler: async (ctx, { id }) => {
		return await ctx.db.get(id);
	},
});

/**
 * Returns the first late_fee obligation linked to a given source obligation.
 * Uses by_type_and_source index for O(log n) lookup instead of full-table scan.
 */
export const getLateFeeForObligation = internalQuery({
	args: {
		sourceObligationId: v.id("obligations"),
	},
	handler: async (ctx, { sourceObligationId }) => {
		return await ctx.db
			.query("obligations")
			.withIndex("by_type_and_source", (q) =>
				q.eq("type", "late_fee").eq("sourceObligationId", sourceObligationId)
			)
			.first();
	},
});
