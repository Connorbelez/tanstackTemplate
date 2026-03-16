import { Crons } from "@convex-dev/crons";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { authedMutation, authedQuery } from "../fluent";

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

export const registerJob = authedMutation
	.input({ name: v.string(), intervalMs: v.number() })
	.handler(async (ctx, args): Promise<string> => {
		return await crons.register(
			ctx,
			{ kind: "interval", ms: args.intervalMs },
			// @ts-expect-error — fluent-convex deep generics exceed TS instantiation depth
			internal.demo.crons.cronTick,
			{ jobName: args.name },
			args.name
		);
	})
	.public();

export const deleteJob = authedMutation
	.input({ name: v.string() })
	.handler(async (ctx, args) => {
		await crons.delete(ctx, { name: args.name });
	})
	.public();

export const listJobs = authedQuery
	.handler(async (ctx) => {
		return await crons.list(ctx);
	})
	.public();

export const getLog = authedQuery
	.handler(async (ctx) => {
		return await ctx.db.query("demo_crons_log").order("desc").take(30);
	})
	.public();

export const clearLog = authedMutation
	.handler(async (ctx) => {
		const logs = await ctx.db.query("demo_crons_log").collect();
		for (const log of logs) {
			await ctx.db.delete(log._id);
		}
	})
	.public();
