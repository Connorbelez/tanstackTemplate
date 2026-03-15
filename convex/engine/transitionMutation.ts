import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import type { EntityType } from "./machines/registry";
import { transitionEntity } from "./transition";

/**
 * Internal mutation wrapper around `transitionEntity` for use from
 * actions and scheduled functions via `ctx.runMutation()`.
 */
export const transitionMutation = internalMutation({
	args: {
		entityType: v.string(),
		entityId: v.string(),
		eventType: v.string(),
		payload: v.optional(
			v.object({
				reason: v.optional(v.string()),
			})
		),
		source: v.optional(
			v.object({
				channel: v.string(),
				actorId: v.optional(v.string()),
				actorType: v.optional(v.string()),
			})
		),
	},
	handler: async (ctx, args) => {
		return transitionEntity(
			ctx,
			args.entityType as EntityType,
			args.entityId as Id<"onboardingRequests">,
			args.eventType,
			(args.payload as Record<string, unknown>) ?? {},
			args.source ?? { channel: "system", actorType: "system" }
		);
	},
});
