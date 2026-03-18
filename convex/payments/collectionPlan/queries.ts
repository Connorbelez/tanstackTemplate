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
 * @deprecated Prefer {@link getPlannedEntriesForObligations} for batch lookups
 * during cron evaluation to avoid repeated full scans of the planned-entry set.
 * This single-obligation variant is retained for one-off admin or event-driven
 * lookups where only a single obligation needs checking.
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
 * Batch idempotency check: loads all "planned" entries once and returns
 * a record mapping each covered obligation ID to its plan entry ID.
 *
 * Callers pass the obligation IDs they care about; the returned record
 * only contains keys for obligations that already have a planned entry.
 * This eliminates the N+1 query pattern where getEntryForObligation was
 * called once per obligation during cron evaluation.
 */
export const getPlannedEntriesForObligations = internalQuery({
	args: {
		obligationIds: v.array(v.id("obligations")),
	},
	handler: async (ctx, { obligationIds }) => {
		const planned = await ctx.db
			.query("collectionPlanEntries")
			.withIndex("by_status", (q) => q.eq("status", "planned"))
			.collect();

		// Build a set for O(1) lookups
		const lookupSet = new Set(obligationIds);

		// Map: obligationId -> planEntryId for obligations that already have entries
		const result: Record<string, string> = {};

		for (const entry of planned) {
			for (const oblId of entry.obligationIds) {
				if (lookupSet.has(oblId) && !(oblId in result)) {
					result[oblId] = entry._id;
				}
			}
		}

		return result;
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

/**
 * Idempotency check for the retry rule.
 * Returns the first retry-sourced plan entry that was rescheduled from the
 * given plan entry ID. Used to prevent duplicate retry entries on re-delivery.
 */
export const getRetryEntryForPlanEntry = internalQuery({
	args: {
		planEntryId: v.id("collectionPlanEntries"),
	},
	handler: async (ctx, { planEntryId }) => {
		return (
			(await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_rescheduled_from", (q) =>
					q.eq("rescheduledFromId", planEntryId).eq("source", "retry_rule")
				)
				.first()) ?? null
		);
	},
});
