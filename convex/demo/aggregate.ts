import { DirectAggregate } from "@convex-dev/aggregate";
import { v } from "convex/values";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";

const aggregate = new DirectAggregate<{
	Key: number[];
	Id: Id<"demo_aggregate_scores">;
}>(components.aggregate);

export const addScore = mutation({
	args: { player: v.string(), score: v.number() },
	handler: async (ctx, args) => {
		const id = await ctx.db.insert("demo_aggregate_scores", {
			player: args.player,
			score: args.score,
		});
		await aggregate.insert(ctx, {
			key: [args.score],
			id,
			sumValue: args.score,
		});
		return id;
	},
});

export const removeScore = mutation({
	args: { id: v.id("demo_aggregate_scores") },
	handler: async (ctx, args) => {
		const doc = await ctx.db.get(args.id);
		if (!doc) {
			throw new Error("Score not found");
		}
		await ctx.db.delete(args.id);
		await aggregate.delete(ctx, { key: [doc.score], id: args.id });
	},
});

export const getStats = query({
	args: {},
	handler: async (ctx) => {
		const count = await aggregate.count(ctx);
		let sum = 0;
		if (count > 0) {
			sum = await aggregate.sum(ctx);
		}
		return { count, sum, average: count > 0 ? Math.round(sum / count) : 0 };
	},
});

export const listScores = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("demo_aggregate_scores")
			.withIndex("by_score")
			.order("desc")
			.take(20);
	},
});
