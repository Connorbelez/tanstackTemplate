/**
 * Multi-leg deal closing pipeline orchestrator.
 *
 * Manages the two-leg fund movement for deal closing:
 *   Leg 1: buyer → trust (inbound, deal_principal_transfer)
 *   Leg 2: trust → seller (outbound, deal_seller_payout)
 *
 * Pipeline status is derived from transfer leg statuses — no separate table.
 * Leg 2 is NEVER created unless Leg 1 is confirmed (REQ-261).
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import type { DealClosingLeg1Metadata } from "./pipeline.types";
import { providerCodeValidator } from "./validators";

/**
 * Builds a deterministic idempotency key for a pipeline leg.
 * Ensures repeated calls for the same pipeline + leg return the same transfer.
 */
export function buildPipelineIdempotencyKey(
	pipelineId: string,
	legNumber: number
): string {
	return `pipeline:${pipelineId}:leg${legNumber}`;
}

// ── createDealClosingPipeline ──────────────────────────────────────
/**
 * Creates and initiates Leg 1 of a deal closing pipeline.
 *
 * Called by the startDealClosingPipeline admin action.
 * Creates an inbound transfer (buyer → trust) and initiates it.
 *
 * Returns the pipelineId and leg1TransferId for tracking.
 */
export const createDealClosingPipeline = internalAction({
	args: {
		dealId: v.id("deals"),
		pipelineId: v.string(),
		buyerId: v.string(),
		sellerId: v.string(),
		mortgageId: v.id("mortgages"),
		leg1Amount: v.number(),
		leg2Amount: v.number(),
		providerCode: providerCodeValidator,
	},
	handler: async (ctx, args) => {
		// Create Leg 1: buyer → trust (inbound, deal_principal_transfer)
		const leg1Id = await ctx.runMutation(
			internal.payments.transfers.mutations.createTransferRequestInternal,
			{
				direction: "inbound",
				transferType: "deal_principal_transfer",
				amount: args.leg1Amount,
				currency: "CAD",
				counterpartyType: "investor",
				counterpartyId: args.buyerId,
				mortgageId: args.mortgageId,
				dealId: args.dealId,
				providerCode: args.providerCode,
				idempotencyKey: buildPipelineIdempotencyKey(args.pipelineId, 1),
				pipelineId: args.pipelineId,
				legNumber: 1,
				metadata: {
					pipelineType: "deal_closing",
					sellerId: args.sellerId,
					leg2Amount: args.leg2Amount,
				} satisfies DealClosingLeg1Metadata,
			}
		);

		console.info(
			`[createDealClosingPipeline] Created Leg 1 transfer ${leg1Id} for deal ${args.dealId} (pipeline: ${args.pipelineId})`
		);

		// Initiate Leg 1 via the provider
		await ctx.runAction(
			internal.payments.transfers.mutations.initiateTransferInternal,
			{ transferId: leg1Id }
		);

		console.info(
			`[createDealClosingPipeline] Initiated Leg 1 transfer ${leg1Id}`
		);

		return { pipelineId: args.pipelineId, leg1TransferId: leg1Id };
	},
});

// ── createAndInitiateLeg2 ──────────────────────────────────────────
/**
 * Creates and initiates Leg 2 of a deal closing pipeline.
 *
 * Called when Leg 1 is confirmed (scheduled by publishTransferConfirmed).
 * Creates an outbound transfer (trust → seller) and initiates it.
 *
 * Reads Leg 2 config from Leg 1's metadata to avoid needing a separate
 * pipeline config table.
 */
export const createAndInitiateLeg2 = internalAction({
	args: {
		pipelineId: v.string(),
		dealId: v.id("deals"),
		sellerId: v.string(),
		mortgageId: v.id("mortgages"),
		leg2Amount: v.number(),
		providerCode: providerCodeValidator,
	},
	handler: async (ctx, args) => {
		// Create Leg 2: trust → seller (outbound, deal_seller_payout)
		const leg2Id = await ctx.runMutation(
			internal.payments.transfers.mutations.createTransferRequestInternal,
			{
				direction: "outbound",
				transferType: "deal_seller_payout",
				amount: args.leg2Amount,
				currency: "CAD",
				counterpartyType: "investor",
				counterpartyId: args.sellerId,
				mortgageId: args.mortgageId,
				dealId: args.dealId,
				providerCode: args.providerCode,
				idempotencyKey: buildPipelineIdempotencyKey(args.pipelineId, 2),
				pipelineId: args.pipelineId,
				legNumber: 2,
				metadata: {
					pipelineType: "deal_closing",
				},
			}
		);

		console.info(
			`[createAndInitiateLeg2] Created Leg 2 transfer ${leg2Id} for deal ${args.dealId} (pipeline: ${args.pipelineId})`
		);

		// Initiate Leg 2 via the provider
		await ctx.runAction(
			internal.payments.transfers.mutations.initiateTransferInternal,
			{ transferId: leg2Id }
		);

		console.info(`[createAndInitiateLeg2] Initiated Leg 2 transfer ${leg2Id}`);

		return { leg2TransferId: leg2Id };
	},
});
