import { Debouncer } from "@ikhrustalev/convex-debouncer";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { authedMutation, authedQuery } from "../fluent";

const debouncer = new Debouncer(components.debouncer, {
	delay: 1500,
	mode: "sliding",
});

export const recordKeystroke = authedMutation
	.input({ text: v.string(), sessionId: v.string() })
	.handler(async (ctx, args) => {
		// Every keystroke triggers debounced processing
		await debouncer.schedule(
			ctx,
			"demo-process",
			args.sessionId,
			internal.demo.debouncer.processText,
			{ text: args.text, sessionId: args.sessionId }
		);
	})
	.public();

export const processText = internalMutation({
	args: { text: v.string(), sessionId: v.string() },
	handler: async (ctx, args) => {
		// Store the processed result in a simple document
		const existing = await ctx.db
			.query("demo_timeline_notes")
			.filter((q) => q.eq(q.field("scope"), `debouncer-${args.sessionId}`))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, {
				content: args.text,
				title: `Processed at ${new Date().toISOString()}`,
			});
		} else {
			await ctx.db.insert("demo_timeline_notes", {
				title: `Processed at ${new Date().toISOString()}`,
				content: args.text,
				scope: `debouncer-${args.sessionId}`,
			});
		}
	},
});

export const getProcessedResult = authedQuery
	.input({ sessionId: v.string() })
	.handler(async (ctx, args) => {
		return await ctx.db
			.query("demo_timeline_notes")
			.filter((q) => q.eq(q.field("scope"), `debouncer-${args.sessionId}`))
			.first();
	})
	.public();
