import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { executeTransition } from "../../engine/transition";
import type { CommandSource } from "../../engine/types";

/**
 * Internal mutation that fires the GT transition `confirmed → reversed`.
 *
 * The GT engine's `emitPaymentReversed` effect (registered in ENG-173)
 * handles the per-obligation cash-ledger reversal cascade automatically
 * by iterating `planEntry.obligationIds` and calling
 * `postPaymentReversalCascade()` for each one. Each call is idempotent
 * via `postingGroupId`.
 *
 * This mutation fires the transition exactly ONCE per collection attempt.
 * It should NOT be called per-obligation.
 */
export const processReversalCascade = internalMutation({
	args: {
		attemptId: v.id("collectionAttempts"),
		effectiveDate: v.string(),
		reason: v.string(),
		provider: v.union(v.literal("rotessa"), v.literal("stripe")),
		providerEventId: v.string(),
	},
	handler: async (ctx, args) => {
		const source: CommandSource = {
			actorType: "system",
			channel: "api_webhook",
			actorId: `webhook:${args.provider}`,
		};

		// Fire the GT transition: confirmed → reversed
		// The emitPaymentReversed effect handles the per-obligation
		// cash ledger reversal cascade (via postPaymentReversalCascade).
		const transitionResult = await executeTransition(ctx, {
			entityType: "collectionAttempt",
			entityId: args.attemptId,
			eventType: "PAYMENT_REVERSED",
			payload: {
				reason: args.reason,
				provider: args.provider,
				providerEventId: args.providerEventId,
				effectiveDate: args.effectiveDate,
			},
			source,
		});

		return {
			success: transitionResult.success,
			newState: transitionResult.newState,
		};
	},
});
