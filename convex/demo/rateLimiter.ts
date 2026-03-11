import { MINUTE, RateLimiter, SECOND } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { mutation, query } from "../_generated/server";

const rateLimiter = new RateLimiter(components.rateLimiter, {
	demoTokenBucket: {
		kind: "token bucket",
		rate: 5,
		period: 10 * SECOND,
		capacity: 3,
	},
	demoFixedWindow: {
		kind: "fixed window",
		rate: 3,
		period: MINUTE,
	},
});

export const attemptAction = mutation({
	args: {
		limitName: v.union(
			v.literal("demoTokenBucket"),
			v.literal("demoFixedWindow")
		),
		key: v.string(),
	},
	handler: async (ctx, args) => {
		const status = await rateLimiter.limit(ctx, args.limitName, {
			key: args.key,
		});
		return {
			ok: status.ok,
			retryAfter: status.ok ? 0 : status.retryAfter,
		};
	},
});

export const checkStatus = query({
	args: {
		limitName: v.union(
			v.literal("demoTokenBucket"),
			v.literal("demoFixedWindow")
		),
		key: v.string(),
	},
	handler: async (ctx, args) => {
		const status = await rateLimiter.check(ctx, args.limitName, {
			key: args.key,
		});
		return {
			ok: status.ok,
			retryAfter: status.ok ? 0 : status.retryAfter,
		};
	},
});
