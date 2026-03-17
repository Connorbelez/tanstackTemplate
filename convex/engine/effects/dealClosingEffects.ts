import { v } from "convex/values";
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
