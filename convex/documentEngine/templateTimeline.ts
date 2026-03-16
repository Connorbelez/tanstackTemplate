import { v } from "convex/values";
import { Timeline } from "convex-timeline";
import { components } from "../_generated/api";
import { authedMutation, requirePermission } from "../fluent";
import { draftStateValidator } from "./validators";

const timeline = new Timeline(components.timeline);

const docGenMutation = authedMutation.use(
	requirePermission("document:generate")
);

function scopeKey(templateId: string): string {
	return `template:${templateId}`;
}

export const pushDraftState = docGenMutation
	.input({
		templateId: v.id("documentTemplates"),
		draft: draftStateValidator,
	})
	.handler(async (ctx, args) => {
		await timeline.push(ctx, scopeKey(args.templateId), args.draft);

		// Also persist to the template table
		await ctx.db.patch(args.templateId, {
			draft: args.draft,
			hasDraftChanges: true,
			updatedAt: Date.now(),
		});
	})
	.public();

export const undoDraft = docGenMutation
	.input({ templateId: v.id("documentTemplates") })
	.handler(async (ctx, args) => {
		const template = await ctx.db.get(args.templateId);
		if (!template) {
			return null;
		}

		const result = await timeline.undo(ctx, scopeKey(args.templateId));
		if (result) {
			await ctx.db.patch(args.templateId, {
				draft: result as typeof template.draft,
				updatedAt: Date.now(),
			});
		}
		return result;
	})
	.public();

export const redoDraft = docGenMutation
	.input({ templateId: v.id("documentTemplates") })
	.handler(async (ctx, args) => {
		const template = await ctx.db.get(args.templateId);
		if (!template) {
			return null;
		}

		const result = await timeline.redo(ctx, scopeKey(args.templateId));
		if (result) {
			await ctx.db.patch(args.templateId, {
				draft: result as typeof template.draft,
				updatedAt: Date.now(),
			});
		}
		return result;
	})
	.public();

export const createDraftCheckpoint = docGenMutation
	.input({
		templateId: v.id("documentTemplates"),
		name: v.string(),
	})
	.handler(async (ctx, args) => {
		await timeline.createCheckpoint(ctx, scopeKey(args.templateId), args.name);
	})
	.public();
