import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

/** Internal query to load a request by ID — used by effects. */
export const getRequestById = internalQuery({
	args: { id: v.id("onboardingRequests") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.id);
	},
});

/** Internal query to load a user by their Convex doc ID. */
export const getUserById = internalQuery({
	args: { id: v.id("users") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.id);
	},
});

/** Patch the targetOrganizationId on a request — used by broker org provisioning effect. */
export const patchTargetOrg = internalMutation({
	args: {
		requestId: v.id("onboardingRequests"),
		targetOrganizationId: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.requestId, {
			targetOrganizationId: args.targetOrganizationId,
		});
	},
});
