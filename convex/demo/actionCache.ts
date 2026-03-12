import { ActionCache } from "@convex-dev/action-cache";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";

export const expensiveWork = internalAction({
	args: { input: v.string() },
	handler: async (
		_ctx,
		args
	): Promise<{ result: string; computedAt: number }> => {
		// Simulate expensive work (2 second delay)
		await new Promise((resolve) => setTimeout(resolve, 2000));
		return {
			result: `Processed "${args.input}" → ${args.input.toUpperCase().split("").reverse().join("")}`,
			computedAt: Date.now(),
		};
	},
});

const cache = new ActionCache(components.actionCache, {
	action: internal.demo.actionCache.expensiveWork,
	name: "demoExpensiveWorkV1",
});

export const fetchCached = action({
	args: { input: v.string() },
	handler: async (
		ctx,
		args
	): Promise<{ result: string; computedAt: number; fromCache: boolean }> => {
		const start = Date.now();
		const data = await cache.fetch(ctx, { input: args.input });
		const elapsed = Date.now() - start;
		return { ...data, fromCache: elapsed < 500 };
	},
});

export const fetchUncached = action({
	args: { input: v.string() },
	handler: async (
		ctx,
		args
	): Promise<{ result: string; computedAt: number; fromCache: boolean }> => {
		const data = await ctx.runAction(internal.demo.actionCache.expensiveWork, {
			input: args.input,
		});
		return { ...data, fromCache: false };
	},
});
