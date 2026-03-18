import { internalMutation } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";

/**
 * Placeholder effects for obligation machine transitions (ENG-57).
 * Each will be replaced by a real implementation in a subsequent ticket.
 */

export const createLateFeeObligation = internalMutation({
	args: effectPayloadValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[placeholder] createLateFeeObligation — will be implemented in ENG-XX (entity=${args.entityId})`
		);
	},
});

export const applyPayment = internalMutation({
	args: effectPayloadValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[placeholder] applyPayment — will be implemented in ENG-XX (entity=${args.entityId})`
		);
	},
});

export const recordWaiver = internalMutation({
	args: effectPayloadValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[placeholder] recordWaiver — will be implemented in ENG-XX (entity=${args.entityId})`
		);
	},
});
