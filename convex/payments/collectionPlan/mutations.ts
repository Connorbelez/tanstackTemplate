import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import {
	createEntryImpl,
	scheduleInitialEntriesImpl,
} from "./initialScheduling";

/**
 * Creates a new collection plan entry.
 * Called by the rules engine and admin overrides to schedule payment collection.
 */
export const createEntry = internalMutation({
	args: {
		obligationIds: v.array(v.id("obligations")),
		amount: v.number(),
		method: v.string(),
		scheduledDate: v.number(),
		status: v.union(
			v.literal("planned"),
			v.literal("provider_scheduled"),
			v.literal("executing"),
			v.literal("completed"),
			v.literal("cancelled"),
			v.literal("rescheduled")
		),
		executionMode: v.optional(
			v.union(v.literal("app_owned"), v.literal("provider_managed"))
		),
		externalCollectionScheduleId: v.optional(
			v.id("externalCollectionSchedules")
		),
		externalOccurrenceOrdinal: v.optional(v.number()),
		source: v.union(
			v.literal("default_schedule"),
			v.literal("retry_rule"),
			v.literal("late_fee_rule"),
			v.literal("admin"),
			v.literal("admin_reschedule"),
			v.literal("admin_workout")
		),
		createdByRuleId: v.optional(v.id("collectionRules")),
		retryOfId: v.optional(v.id("collectionPlanEntries")),
		workoutPlanId: v.optional(v.id("workoutPlans")),
		rescheduledFromId: v.optional(v.id("collectionPlanEntries")),
		rescheduleReason: v.optional(v.string()),
		rescheduleRequestedAt: v.optional(v.number()),
		rescheduleRequestedByActorId: v.optional(v.string()),
		rescheduleRequestedByActorType: v.optional(
			v.union(
				v.literal("admin"),
				v.literal("borrower"),
				v.literal("broker"),
				v.literal("member"),
				v.literal("system")
			)
		),
	},
	handler: async (ctx, args) => await createEntryImpl(ctx, args),
});

/**
 * Canonical initial scheduling seam used by both the schedule rule and
 * bootstrap/activation-style orchestration.
 */
export const scheduleInitialEntries = internalMutation({
	args: {
		delayDays: v.number(),
		mortgageId: v.optional(v.id("mortgages")),
		nowMs: v.optional(v.number()),
		createdByRuleId: v.optional(v.id("collectionRules")),
	},
	handler: async (ctx, args) => await scheduleInitialEntriesImpl(ctx, args),
});
