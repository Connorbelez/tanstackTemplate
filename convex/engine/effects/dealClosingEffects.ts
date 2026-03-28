import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";

const dealEffectPayloadValidator = {
	...effectPayloadValidator,
	entityId: v.id("deals"),
	entityType: v.literal("deal"),
};

/**
 * Stub: notifies buyer, seller, and lawyer that a deal has been locked.
 * // TODO: Phase 2 — replace with real implementation (email via Resend)
 */
export const notifyAllParties = internalAction({
	args: dealEffectPayloadValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[stub] notifyAllParties: Would notify buyer, seller, lawyer for ${args.entityType} ${args.entityId}`
		);
	},
});

/**
 * Stub: notifies all parties that a deal has been cancelled.
 * // TODO: Phase 2 — replace with real implementation (email via Resend)
 */
export const notifyCancellation = internalAction({
	args: dealEffectPayloadValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[stub] notifyCancellation: Would notify all parties of cancellation for ${args.entityType} ${args.entityId}`
		);
	},
});

/**
 * Stub: creates a Documenso document package for the deal.
 * // TODO: Phase 2 — replace with real implementation (Documenso API)
 */
export const createDocumentPackage = internalAction({
	args: dealEffectPayloadValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[stub] createDocumentPackage: Would create Documenso document package for ${args.entityType} ${args.entityId}`
		);
	},
});

/**
 * Stub: archives signed documents after all parties have signed.
 * // TODO: Phase 2 — replace with real implementation (Documenso + convex-fs)
 */
export const archiveSignedDocuments = internalAction({
	args: dealEffectPayloadValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[stub] archiveSignedDocuments: Would archive signed documents for ${args.entityType} ${args.entityId}`
		);
	},
});

/**
 * Stub: confirms receipt of funds for the deal.
 * // TODO: Phase 2 — replace with real implementation (VoPay API)
 */
export const confirmFundsReceipt = internalAction({
	args: dealEffectPayloadValidator,
	handler: async (_ctx, args) => {
		console.info(
			`[stub] confirmFundsReceipt: Would confirm funds receipt for ${args.entityType} ${args.entityId}`
		);
	},
});

/**
 * Collects a locking fee from the buyer when a deal enters the locked state.
 * Locking fees credit UNAPPLIED_CASH (not BORROWER_RECEIVABLE) and have no obligation reference.
 * Resilient: logs and returns on missing deal or zero/undefined fee amount.
 */
export const collectLockingFee = internalAction({
	args: dealEffectPayloadValidator,
	handler: async (ctx, args) => {
		const deal = await ctx
			.runQuery(internal.deals.queries.getInternalDeal, {
				dealId: args.entityId,
			})
			.catch(() => null);

		if (!deal) {
			console.error(
				`[collectLockingFee] Deal ${args.entityId} not found — skipping`
			);
			return;
		}

		if (deal.lockingFeeAmount === undefined || deal.lockingFeeAmount <= 0) {
			console.info(
				`[collectLockingFee] No locking fee configured for deal ${args.entityId} — skipping`
			);
			return;
		}

		// Validate amount is a safe integer (cents). createTransferRequestInternal
		// enforces this too, but catching it here avoids a scheduler retry loop on
		// misconfigured fee values like 12.34.
		if (
			!(
				Number.isInteger(deal.lockingFeeAmount) &&
				Number.isSafeInteger(deal.lockingFeeAmount)
			)
		) {
			console.error(
				`[collectLockingFee] Invalid lockingFeeAmount ${deal.lockingFeeAmount} for deal ${args.entityId} — ` +
					"must be a safe integer (cents). Skipping."
			);
			return;
		}

		const idempotencyKey = `locking-fee:${args.entityId}`;

		try {
			const transferId = await ctx.runMutation(
				internal.payments.transfers.mutations.createTransferRequestInternal,
				{
					direction: "inbound",
					transferType: "locking_fee_collection",
					amount: deal.lockingFeeAmount,
					counterpartyType: "borrower",
					counterpartyId: deal.buyerId,
					mortgageId: deal.mortgageId,
					dealId: args.entityId,
					providerCode: "manual",
					idempotencyKey,
				}
			);

			await ctx.runAction(
				internal.payments.transfers.mutations.initiateTransferInternal,
				{ transferId }
			);

			console.info(
				`[collectLockingFee] Created and initiated locking fee transfer ${transferId} for deal ${args.entityId}`
			);
		} catch (error) {
			console.error(
				`[collectLockingFee] Failed to create/initiate locking fee transfer for deal ${args.entityId}:`,
				error
			);
			// Graceful failure — do not propagate to scheduler to avoid retry loops.
			// The deal remains locked; admin can retry the fee collection manually.
		}
	},
});
