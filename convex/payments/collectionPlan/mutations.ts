import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { scheduleInitialEntriesImpl } from "./initialScheduling";

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
			v.literal("executing"),
			v.literal("completed"),
			v.literal("cancelled"),
			v.literal("rescheduled")
		),
		source: v.union(
			v.literal("default_schedule"),
			v.literal("retry_rule"),
			v.literal("late_fee_rule"),
			v.literal("admin")
		),
		ruleId: v.optional(v.id("collectionRules")),
		rescheduledFromId: v.optional(v.id("collectionPlanEntries")),
	},
	handler: async (ctx, args) =>
		await ctx.db.insert("collectionPlanEntries", {
			obligationIds: args.obligationIds,
			amount: args.amount,
			method: args.method,
			scheduledDate: args.scheduledDate,
			status: args.status,
			source: args.source,
			ruleId: args.ruleId,
			rescheduledFromId: args.rescheduledFromId,
			createdAt: Date.now(),
		}),
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
		ruleId: v.optional(v.id("collectionRules")),
	},
	handler: async (ctx, args) => await scheduleInitialEntriesImpl(ctx, args),
});
