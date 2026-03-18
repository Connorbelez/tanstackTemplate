import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";

/**
 * Returns all enabled collection rules for a given trigger type,
 * sorted by priority (ascending) via the by_trigger index.
 */
export const getEnabledRules = internalQuery({
	args: {
		trigger: v.union(v.literal("schedule"), v.literal("event")),
	},
	handler: async (ctx, { trigger }) => {
		return await ctx.db
			.query("collectionRules")
			.withIndex("by_trigger", (q) =>
				q.eq("trigger", trigger).eq("enabled", true)
			)
			.collect();
	},
});

/**
 * Returns the first "planned" collection plan entry that includes
 * the given obligation ID.
 *
 * Convex filters cannot check array-includes, so we collect all planned
 * entries and filter in JS. Acceptable because the planned entry set is
 * small relative to total entries.
 */
export const getEntryForObligation = internalQuery({
	args: {
		obligationId: v.id("obligations"),
	},
	handler: async (ctx, { obligationId }) => {
		const planned = await ctx.db
			.query("collectionPlanEntries")
			.withIndex("by_status", (q) => q.eq("status", "planned"))
			.collect();

		return (
			planned.find((entry) => entry.obligationIds.includes(obligationId)) ??
			null
		);
	},
});

/**
 * Returns collection plan entries matching a given status.
 * Optionally filters to entries scheduled on or before a given timestamp.
 */
export const getPlanEntriesByStatus = internalQuery({
	args: {
		status: v.union(
			v.literal("planned"),
			v.literal("executing"),
			v.literal("completed"),
			v.literal("cancelled"),
			v.literal("rescheduled")
		),
		scheduledBefore: v.optional(v.number()),
	},
	handler: async (ctx, { status, scheduledBefore }) => {
		let query = ctx.db
			.query("collectionPlanEntries")
			.withIndex("by_status", (q) => q.eq("status", status));

		if (scheduledBefore !== undefined) {
			query = query.filter((q) =>
				q.lte(q.field("scheduledDate"), scheduledBefore)
			);
		}

		return await query.collect();
	},
});
