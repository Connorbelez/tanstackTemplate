import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";

/**
 * Get all obligations for a mortgage, optionally filtered by status.
 * Uses the by_mortgage composite index (mortgageId, status).
 */
export const getObligationsByMortgage = internalQuery({
	args: {
		mortgageId: v.id("mortgages"),
		status: v.optional(v.string()),
	},
	handler: async (ctx, { mortgageId, status }) => {
		if (status !== undefined) {
			return await ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (q) =>
					q.eq("mortgageId", mortgageId).eq("status", status)
				)
				.collect();
		}
		return await ctx.db
			.query("obligations")
			.withIndex("by_mortgage", (q) => q.eq("mortgageId", mortgageId))
			.collect();
	},
});

/**
 * Get upcoming obligations whose dueDate is at or before `asOf`.
 * Uses by_status index to find "upcoming" obligations, then filters by dueDate.
 */
export const getUpcomingDue = internalQuery({
	args: {
		asOf: v.number(),
	},
	handler: async (ctx, { asOf }) => {
		return await ctx.db
			.query("obligations")
			.withIndex("by_status", (q) => q.eq("status", "upcoming"))
			.filter((q) => q.lte(q.field("dueDate"), asOf))
			.collect();
	},
});

/**
 * Get "due" obligations whose grace period has expired (gracePeriodEnd <= asOf).
 * Uses by_status index to find "due" obligations, then filters by gracePeriodEnd.
 */
export const getDuePastGrace = internalQuery({
	args: {
		asOf: v.number(),
	},
	handler: async (ctx, { asOf }) => {
		return await ctx.db
			.query("obligations")
			.withIndex("by_status", (q) => q.eq("status", "due"))
			.filter((q) => q.lte(q.field("gracePeriodEnd"), asOf))
			.collect();
	},
});

/**
 * Get all overdue obligations for a mortgage.
 * Uses by_mortgage composite index with status "overdue".
 */
export const getOverdue = internalQuery({
	args: {
		mortgageId: v.id("mortgages"),
	},
	handler: async (ctx, { mortgageId }) => {
		return await ctx.db
			.query("obligations")
			.withIndex("by_mortgage", (q) =>
				q.eq("mortgageId", mortgageId).eq("status", "overdue")
			)
			.collect();
	},
});

/**
 * Find a late_fee obligation derived from a given source obligation.
 * No dedicated index exists — uses a filtered query over all obligations.
 */
export const getLateFeeForObligation = internalQuery({
	args: {
		sourceObligationId: v.id("obligations"),
	},
	handler: async (ctx, { sourceObligationId }) => {
		return await ctx.db
			.query("obligations")
			.withIndex("by_type_source_and_fee_code", (q) =>
				q
					.eq("type", "late_fee")
					.eq("sourceObligationId", sourceObligationId)
					.eq("feeCode", "late_fee")
			)
			.first();
	},
});
