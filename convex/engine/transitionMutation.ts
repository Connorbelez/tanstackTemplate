import { internalMutation } from "../_generated/server";
import { transitionEntity } from "./transition";
import type { EntityType } from "./types";
import { commandArgsValidator } from "./validators";

/**
 * Internal mutation wrapper around `transitionEntity` for use from
 * actions and scheduled functions via `ctx.runMutation()`.
 */
export const transitionMutation = internalMutation({
	args: commandArgsValidator,
	handler: async (ctx, args) => {
		return transitionEntity(
			ctx,
			args.entityType as EntityType,
			args.entityId,
			args.eventType,
			(args.payload as Record<string, unknown>) ?? {},
			args.source
		);
	},
});
