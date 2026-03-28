/**
 * Investor principal return orchestrator.
 *
 * Phase 1: admin triggers principal return manually via returnInvestorPrincipal.
 * Automated triggers (e.g. post-deal-closing pipeline) can call the same
 * internal action when product flows are ready.
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import {
	buildPrincipalReturnIdempotencyKey,
	computeProrationAdjustedAmount,
} from "./principalReturn.logic";
import { providerCodeValidator } from "./validators";

/**
 * Internal action to orchestrate investor principal return.
 *
 * Creates a transfer request and initiates it via the resolved provider.
 * Must be an internalAction (not mutation) because `initiateTransferInternal`
 * is itself an action (providers may make external HTTP calls).
 */
export const createPrincipalReturn = internalAction({
	args: {
		dealId: v.id("deals"),
		sellerId: v.string(),
		lenderId: v.id("lenders"),
		mortgageId: v.id("mortgages"),
		principalAmount: v.number(),
		prorationAdjustment: v.number(),
		providerCode: providerCodeValidator,
		bankAccountRef: v.optional(v.string()),
		pipelineId: v.optional(v.string()),
		legNumber: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const amount = computeProrationAdjustedAmount(
			args.principalAmount,
			args.prorationAdjustment
		);
		const idempotencyKey = buildPrincipalReturnIdempotencyKey(
			args.dealId,
			args.sellerId
		);

		const transferId = await ctx.runMutation(
			internal.payments.transfers.mutations.createTransferRequestInternal,
			{
				direction: "outbound",
				transferType: "lender_principal_return",
				amount,
				counterpartyType: "investor",
				counterpartyId: args.sellerId,
				mortgageId: args.mortgageId,
				dealId: args.dealId,
				lenderId: args.lenderId,
				providerCode: args.providerCode,
				bankAccountRef: args.bankAccountRef,
				idempotencyKey,
				pipelineId: args.pipelineId,
				legNumber: args.legNumber,
			}
		);

		console.info(
			`[createPrincipalReturn] Created transfer request ${transferId} (idempotencyKey=${idempotencyKey})`
		);

		try {
			await ctx.runAction(
				internal.payments.transfers.mutations.initiateTransferInternal,
				{ transferId }
			);
		} catch (error) {
			console.error(
				`[createPrincipalReturn] initiateTransferInternal failed; transferId=${transferId}`,
				error
			);
			throw error;
		}

		return { transferId };
	},
});
