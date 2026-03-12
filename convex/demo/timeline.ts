import { v } from "convex/values";
import { Timeline } from "convex-timeline";
import { components } from "../_generated/api";
import { mutation, query } from "../_generated/server";

const timeline = new Timeline(components.timeline);

export const pushState = mutation({
	args: { scope: v.string(), title: v.string(), content: v.string() },
	handler: async (ctx, args) => {
		await timeline.push(ctx, args.scope, {
			title: args.title,
			content: args.content,
		});
		// Also update the demo table for display
		const existing = await ctx.db
			.query("demo_timeline_notes")
			.filter((q) => q.eq(q.field("scope"), args.scope))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, {
				title: args.title,
				content: args.content,
			});
		} else {
			await ctx.db.insert("demo_timeline_notes", {
				title: args.title,
				content: args.content,
				scope: args.scope,
			});
		}
	},
});

export const undo = mutation({
	args: { scope: v.string() },
	handler: async (ctx, args) => {
		const result = await timeline.undo(ctx, args.scope);
		if (
			result &&
			typeof result === "object" &&
			"title" in result &&
			"content" in result
		) {
			const state = result as { title: string; content: string };
			const existing = await ctx.db
				.query("demo_timeline_notes")
				.filter((q) => q.eq(q.field("scope"), args.scope))
				.first();
			if (existing) {
				await ctx.db.patch(existing._id, {
					title: state.title,
					content: state.content,
				});
			} else {
				await ctx.db.insert("demo_timeline_notes", {
					title: state.title,
					content: state.content,
					scope: args.scope,
				});
			}
		}
		return result;
	},
});

export const redo = mutation({
	args: { scope: v.string() },
	handler: async (ctx, args) => {
		const result = await timeline.redo(ctx, args.scope);
		if (
			result &&
			typeof result === "object" &&
			"title" in result &&
			"content" in result
		) {
			const state = result as { title: string; content: string };
			const existing = await ctx.db
				.query("demo_timeline_notes")
				.filter((q) => q.eq(q.field("scope"), args.scope))
				.first();
			if (existing) {
				await ctx.db.patch(existing._id, {
					title: state.title,
					content: state.content,
				});
			} else {
				await ctx.db.insert("demo_timeline_notes", {
					title: state.title,
					content: state.content,
					scope: args.scope,
				});
			}
		}
		return result;
	},
});

export const createCheckpoint = mutation({
	args: { scope: v.string(), name: v.string() },
	handler: async (ctx, args) => {
		await timeline.createCheckpoint(ctx, args.scope, args.name);
	},
});

export const restoreCheckpoint = mutation({
	args: { scope: v.string(), name: v.string() },
	handler: async (ctx, args) => {
		const result = await timeline.restoreCheckpoint(ctx, args.scope, args.name);
		if (result) {
			const state = result as { title: string; content: string };
			const existing = await ctx.db
				.query("demo_timeline_notes")
				.filter((q) => q.eq(q.field("scope"), args.scope))
				.first();
			if (existing) {
				await ctx.db.patch(existing._id, {
					title: state.title,
					content: state.content,
				});
			}
		}
		return result;
	},
});

export const getCurrentState = query({
	args: { scope: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("demo_timeline_notes")
			.filter((q) => q.eq(q.field("scope"), args.scope))
			.first();
	},
});
