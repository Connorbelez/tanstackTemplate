import { Crons } from "@convex-dev/crons";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalMutation, mutation, query } from "../_generated/server";

const crons = new Crons(components.crons);

export const cronTick = internalMutation({
	args: { jobName: v.string() },
	handler: async (ctx, args) => {
		await ctx.db.insert("demo_crons_log", {
			jobName: args.jobName,
			message: `Cron "${args.jobName}" executed`,
			ranAt: Date.now(),
		});
	},
});

export const registerJob = mutation({
	args: { name: v.string(), intervalMs: v.number() },
	returns: v.string(),
	handler: async (ctx, args): Promise<string> => {
		return await crons.register(
			ctx,
			{ kind: "interval", ms: args.intervalMs },
			internal.demo.crons.cronTick,
			{ jobName: args.name },
			args.name
		);
	},
});

export const deleteJob = mutation({
	args: { name: v.string() },
	handler: async (ctx, args) => {
		await crons.delete(ctx, { name: args.name });
	},
});

export const listJobs = query({
	args: {},
	handler: async (ctx) => {
		return await crons.list(ctx);
	},
});

export const getLog = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("demo_crons_log").order("desc").take(30);
	},
});

export const clearLog = mutation({
	args: {},
	handler: async (ctx) => {
		const logs = await ctx.db.query("demo_crons_log").collect();
		for (const log of logs) {
			await ctx.db.delete(log._id);
		}
	},
});
