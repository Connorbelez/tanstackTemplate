import { internalMutation } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";

/**
 * Stub: emits an event when an obligation becomes overdue.
 * Will be replaced with cross-entity dispatch logic in a future milestone.
 */
export const emitObligationOverdue = internalMutation({
	args: effectPayloadValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[stub] emitObligationOverdue: entity=${args.entityId}, event=${args.eventType}`
		);
	},
});

/**
 * Stub: emits an event when an obligation is settled.
 * Will be replaced with cross-entity dispatch logic in a future milestone.
 */
export const emitObligationSettled = internalMutation({
	args: effectPayloadValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[stub] emitObligationSettled: entity=${args.entityId}, event=${args.eventType}`
		);
	},
});
