import type { Id } from "../../_generated/dataModel";
import { internalMutation } from "../../_generated/server";
import { executeTransition } from "../transition";
import { effectPayloadValidator } from "../validators";

/**
 * Cross-entity effect: fires OBLIGATION_OVERDUE at the parent mortgage.
 * Triggered when an obligation transitions due → overdue via GRACE_PERIOD_EXPIRED.
 */
export const emitObligationOverdue = internalMutation({
	args: effectPayloadValidator,
	handler: async (ctx, args) => {
		const obligation = await ctx.db.get(
			args.entityId as Id<"obligations">
		);
		if (!obligation) {
			throw new Error(
				`[emitObligationOverdue] Obligation not found: ${args.entityId}`
			);
		}

		const result = await executeTransition(ctx, {
			entityType: "mortgage",
			entityId: obligation.mortgageId,
			eventType: "OBLIGATION_OVERDUE",
			payload: { obligationId: args.entityId },
			source: { channel: "scheduler", actorType: "system" },
		});

		if (!result.success) {
			throw new Error(
				`[emitObligationOverdue] Mortgage transition failed for ${obligation.mortgageId}: ${result.reason}`
			);
		}

		console.info(
			`[emitObligationOverdue] obligation=${args.entityId} → mortgage=${obligation.mortgageId}: ${result.previousState} → ${result.newState}`
		);
	},
});

/**
 * Cross-entity effect: fires PAYMENT_CONFIRMED at the parent mortgage.
 * Triggered when an obligation transitions overdue → settled via PAYMENT_APPLIED.
 */
export const emitObligationSettled = internalMutation({
	args: effectPayloadValidator,
	handler: async (ctx, args) => {
		const obligation = await ctx.db.get(
			args.entityId as Id<"obligations">
		);
		if (!obligation) {
			throw new Error(
				`[emitObligationSettled] Obligation not found: ${args.entityId}`
			);
		}

		const result = await executeTransition(ctx, {
			entityType: "mortgage",
			entityId: obligation.mortgageId,
			eventType: "PAYMENT_CONFIRMED",
			payload: {
				obligationId: args.entityId,
				amount: obligation.settledAmount ?? obligation.amount,
				paidAt: obligation.settledAt ?? Date.now(),
			},
			source: { channel: "scheduler", actorType: "system" },
		});

		if (!result.success) {
			throw new Error(
				`[emitObligationSettled] Mortgage transition failed for ${obligation.mortgageId}: ${result.reason}`
			);
		}

		console.info(
			`[emitObligationSettled] obligation=${args.entityId} → mortgage=${obligation.mortgageId}: ${result.previousState} → ${result.newState}`
		);
	},
});
