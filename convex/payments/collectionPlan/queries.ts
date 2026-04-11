import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import {
	compareCollectionRules,
	isCollectionRuleActive,
	isCollectionRuleEffectiveAt,
	matchesCollectionRuleScope,
} from "./ruleContract";

/**
 * Returns all active collection rules for a given trigger type, filtered by
 * optional scope and effective window, then sorted deterministically.
 */
export const getEnabledRules = internalQuery({
	args: {
		asOfMs: v.optional(v.number()),
		mortgageId: v.optional(v.id("mortgages")),
		trigger: v.union(v.literal("schedule"), v.literal("event")),
	},
	handler: async (ctx, { trigger, mortgageId, asOfMs }) => {
		const ruleCandidates = await ctx.db
			.query("collectionRules")
			.withIndex("by_trigger", (q) =>
				q.eq("trigger", trigger).eq("status", "active")
			)
			.collect();

		const effectiveAt = asOfMs ?? Date.now();
		return ruleCandidates
			.filter((rule) => isCollectionRuleActive(rule))
			.filter((rule) => isCollectionRuleEffectiveAt(rule, effectiveAt))
			.filter((rule) => matchesCollectionRuleScope(rule, mortgageId))
			.sort(compareCollectionRules);
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
			v.literal("provider_scheduled"),
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
 * Returns due `planned` collection plan entries up to a bounded limit.
 *
 * This is the production-safe scheduler selection path for the page-03
 * execution spine. It intentionally returns only rows that are still in the
 * `planned` state so cron reruns naturally skip already-consumed work.
 */
export const getDuePlannedEntries = internalQuery({
	args: {
		asOf: v.number(),
		limit: v.optional(v.number()),
		mortgageId: v.optional(v.id("mortgages")),
	},
	handler: async (ctx, { asOf, limit, mortgageId }) => {
		const boundedLimit = Math.max(1, Math.min(limit ?? 25, 100));

		const duePlannedEntries =
			mortgageId === undefined
				? ctx.db
						.query("collectionPlanEntries")
						.withIndex("by_status_scheduled_date", (q) =>
							q.eq("status", "planned").lte("scheduledDate", asOf)
						)
				: ctx.db
						.query("collectionPlanEntries")
						.withIndex("by_mortgage_status_scheduled", (q) =>
							q
								.eq("mortgageId", mortgageId)
								.eq("status", "planned")
								.lte("scheduledDate", asOf)
						);

		return await duePlannedEntries
			.filter((q) =>
				q.or(
					q.eq(q.field("executionMode"), undefined),
					q.eq(q.field("executionMode"), "app_owned")
				)
			)
			.filter((q) =>
				q.or(
					q.eq(q.field("balancePreCheckDecision"), undefined),
					q.eq(q.field("balancePreCheckDecision"), "proceed"),
					q.and(
						q.eq(q.field("balancePreCheckDecision"), "defer"),
						q.or(
							q.eq(q.field("balancePreCheckNextEvaluationAt"), undefined),
							q.lte(q.field("balancePreCheckNextEvaluationAt"), asOf)
						)
					)
				)
			)
			.take(boundedLimit);
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
				.withIndex("by_retry_of", (q) =>
					q.eq("retryOfId", planEntryId).eq("source", "retry_rule")
				)
				.first()) ?? null
		);
	},
});
