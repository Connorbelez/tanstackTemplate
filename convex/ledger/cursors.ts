import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const getCursor = query({
	args: { consumerId: v.string() },
	handler: async (ctx, args) => {
		return ctx.db
			.query("ledger_cursors")
			.withIndex("by_consumer", (q) => q.eq("consumerId", args.consumerId))
			.first();
	},
});

export const advanceCursor = mutation({
	args: {
		consumerId: v.string(),
		lastProcessedSequence: v.int64(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("ledger_cursors")
			.withIndex("by_consumer", (q) => q.eq("consumerId", args.consumerId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				lastProcessedSequence: args.lastProcessedSequence,
				lastProcessedAt: Date.now(),
			});
		} else {
			await ctx.db.insert("ledger_cursors", {
				consumerId: args.consumerId,
				lastProcessedSequence: args.lastProcessedSequence,
				lastProcessedAt: Date.now(),
			});
		}
	},
});

export const resetCursor = mutation({
	args: {
		consumerId: v.string(),
		toSequence: v.optional(v.int64()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("ledger_cursors")
			.withIndex("by_consumer", (q) => q.eq("consumerId", args.consumerId))
			.first();

		const targetSequence = args.toSequence ?? 0n;

		if (existing) {
			await ctx.db.patch(existing._id, {
				lastProcessedSequence: targetSequence,
				lastProcessedAt: Date.now(),
			});
		} else {
			await ctx.db.insert("ledger_cursors", {
				consumerId: args.consumerId,
				lastProcessedSequence: targetSequence,
				lastProcessedAt: Date.now(),
			});
		}
	},
});
