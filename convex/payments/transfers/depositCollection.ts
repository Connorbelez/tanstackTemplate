/**
 * Commitment deposit collection orchestrator.
 *
 * Phase 1: admin triggers deposit collection manually. Automated triggers can
 * call the same internal action when product flows are ready.
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import {
	buildCommitmentDepositIdempotencyKey,
	buildCommitmentDepositMetadata,
	getCommitmentDepositValidationError,
	resolveCommitmentDepositProviderCode,
} from "./depositCollection.logic";
import { providerCodeValidator } from "./validators";

/**
 * Internal action to orchestrate commitment deposit collection.
 *
 * Creates a transfer request and initiates it via the resolved provider.
 * Must be an internalAction (not mutation) because `initiateTransferInternal`
 * is itself an action (providers may make external HTTP calls).
 */
export const collectCommitmentDeposit = internalAction({
	args: {
		dealId: v.optional(v.id("deals")),
		applicationId: v.optional(v.string()),
		borrowerId: v.id("borrowers"),
		mortgageId: v.id("mortgages"),
		amount: v.number(),
		providerCode: v.optional(providerCodeValidator),
	},
	handler: async (ctx, args) => {
		const validationError = getCommitmentDepositValidationError({
			dealId: args.dealId,
			applicationId: args.applicationId,
			amount: args.amount,
		});
		if (validationError) {
			throw new ConvexError(validationError);
		}

		const idempotencyKey = buildCommitmentDepositIdempotencyKey(
			args.dealId,
			args.applicationId
		);
		const metadata = buildCommitmentDepositMetadata(args.applicationId);
		const providerCode = resolveCommitmentDepositProviderCode(
			args.providerCode
		);

		const transferId = await ctx.runMutation(
			internal.payments.transfers.mutations.createTransferRequestInternal,
			{
				direction: "inbound",
				transferType: "commitment_deposit_collection",
				amount: args.amount,
				counterpartyType: "borrower",
				counterpartyId: args.borrowerId,
				mortgageId: args.mortgageId,
				dealId: args.dealId,
				providerCode,
				idempotencyKey,
				metadata,
			}
		);

		console.info(
			`[collectCommitmentDeposit] Created transfer request ${transferId} (idempotencyKey=${idempotencyKey})`
		);

		try {
			await ctx.runAction(
				internal.payments.transfers.mutations.initiateTransferInternal,
				{ transferId }
			);
		} catch (error) {
			console.error(
				`[collectCommitmentDeposit] initiateTransferInternal failed after create; transferId=${transferId}`,
				error
			);
			throw error;
		}

		return { transferId };
	},
});
