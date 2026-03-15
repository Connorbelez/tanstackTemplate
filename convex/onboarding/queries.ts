import { v } from "convex/values";
import { adminQuery, authedQuery, requirePermission } from "../fluent";

/** List onboarding requests by status. Defaults to pending_review. Admin only. */
export const listPendingRequests = adminQuery
	.use(requirePermission("onboarding:review"))
	.input({ status: v.optional(v.string()) })
	.handler(async (ctx, args) => {
		const status = args.status ?? "pending_review";
		const requests = await ctx.db
			.query("onboardingRequests")
			.withIndex("by_status", (q) => q.eq("status", status))
			.collect();

		const results = await Promise.all(
			requests.map(async (request) => {
				const user = await ctx.db.get(request.userId);
				return { request, user };
			})
		);

		return results;
	})
	.public();

/** Get the authenticated user's onboarding request(s). */
export const getMyOnboardingRequest = authedQuery
	.handler(async (ctx) => {
		const user = await ctx.db
			.query("users")
			.withIndex("authId", (q) => q.eq("authId", ctx.viewer.authId))
			.unique();
		if (!user) {
			return null;
		}

		const requests = await ctx.db
			.query("onboardingRequests")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();

		return requests;
	})
	.public();

/** Get the full audit journal history for a request. Admin only. */
export const getRequestHistory = adminQuery
	.use(requirePermission("onboarding:review"))
	.input({ requestId: v.id("onboardingRequests") })
	.handler(async (ctx, args) => {
		const entries = await ctx.db
			.query("auditJournal")
			.withIndex("by_entity", (q) =>
				q
					.eq("entityType", "onboardingRequest")
					.eq("entityId", args.requestId as string)
			)
			.collect();

		return entries;
	})
	.public();
