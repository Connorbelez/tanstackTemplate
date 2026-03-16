import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const effectArgs = {
	entityId: v.id("demo_gt_entities"),
	journalEntryId: v.id("demo_gt_journal"),
	effectName: v.string(),
};

export const notifyReviewer = internalMutation({
	args: effectArgs,
	handler: async (ctx, { entityId, journalEntryId, effectName }) => {
		await ctx.db.insert("demo_gt_effects_log", {
			entityId,
			journalEntryId,
			effectName,
			status: "completed",
			scheduledAt: Date.now(),
			completedAt: Date.now(),
		});
	},
});

export const notifyApplicant = internalMutation({
	args: effectArgs,
	handler: async (ctx, { entityId, journalEntryId, effectName }) => {
		await ctx.db.insert("demo_gt_effects_log", {
			entityId,
			journalEntryId,
			effectName,
			status: "completed",
			scheduledAt: Date.now(),
			completedAt: Date.now(),
		});
	},
});

export const scheduleFunding = internalMutation({
	args: effectArgs,
	handler: async (ctx, { entityId, journalEntryId, effectName }) => {
		await ctx.db.insert("demo_gt_effects_log", {
			entityId,
			journalEntryId,
			effectName,
			status: "completed",
			scheduledAt: Date.now(),
			completedAt: Date.now(),
		});
	},
});

export const generateDocuments = internalMutation({
	args: effectArgs,
	handler: async (ctx, { entityId, journalEntryId, effectName }) => {
		await ctx.db.insert("demo_gt_effects_log", {
			entityId,
			journalEntryId,
			effectName,
			status: "completed",
			scheduledAt: Date.now(),
			completedAt: Date.now(),
		});
	},
});
