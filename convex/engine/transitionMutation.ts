import { internalMutation } from "../_generated/server";
import { executeTransition } from "./transition";
import type { EntityType } from "./types";
import { commandArgsValidator } from "./validators";

/**
 * Internal mutation wrapper around `executeTransition` for use from
 * actions and scheduled functions via `ctx.runMutation()`.
 */
export const transitionMutation = internalMutation({
	args: commandArgsValidator,
	handler: async (ctx, args) => {
		return executeTransition(ctx, {
			entityType: args.entityType as EntityType,
			entityId: args.entityId,
			eventType: args.eventType,
			payload: (args.payload as Record<string, unknown>) ?? {},
			source: args.source,
		});
	},
});
