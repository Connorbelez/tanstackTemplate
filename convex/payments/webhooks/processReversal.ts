import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { executeTransition } from "../../engine/transition";
import type { CommandSource } from "../../engine/types";

/**
 * Internal mutation that fires the transfer GT transition `confirmed → reversed`.
 *
 * The transfer effect reconciles any linked collection attempt back through
 * the borrower-payment reversal path, including the per-obligation cash-ledger
 * reversal cascade. This mutation therefore transitions the canonical transfer
 * record once and lets the downstream effects fan out.
 *
 * This mutation fires the transition exactly ONCE per transfer request.
 */
export const processReversalCascade = internalMutation({
	args: {
		transferId: v.id("transferRequests"),
		effectiveDate: v.string(),
		reason: v.string(),
		provider: v.union(
			v.literal("rotessa"),
			v.literal("stripe"),
			v.literal("pad_vopay")
		),
		providerEventId: v.string(),
	},
	handler: async (ctx, args) => {
		const source: CommandSource = {
			actorType: "system",
			channel: "api_webhook",
			actorId: `webhook:${args.provider}`,
		};

		// Fire the canonical transfer transition: confirmed → reversed.
		const transitionResult = await executeTransition(ctx, {
			entityType: "transfer",
			entityId: args.transferId,
			eventType: "TRANSFER_REVERSED",
			payload: {
				reversalRef: args.providerEventId,
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
