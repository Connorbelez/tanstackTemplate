import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { type ActionCtx, internalAction } from "../../_generated/server";
import { handlePaymentReversal } from "./handleReversal";
import {
	markTransferWebhookFailed,
	markTransferWebhookProcessed,
	patchPersistedTransferWebhookMetadata,
	persistVerifiedTransferWebhook,
} from "./transferCore";
import type { ReversalWebhookPayload } from "./types";

const reversalWebhookPayloadValidator = v.object({
	originalAmount: v.number(),
	provider: v.union(v.literal("rotessa"), v.literal("pad_vopay")),
	providerEventId: v.string(),
	providerRef: v.string(),
	reversalCode: v.optional(v.string()),
	reversalDate: v.string(),
	reversalReason: v.string(),
});

function buildProcessingError(result: {
	reason?: string;
	success: boolean;
	transferId?: Id<"transferRequests">;
}) {
	return result.reason ?? "legacy_reversal_processing_failed";
}

export async function persistLegacyReversalWebhook(
	ctx: ActionCtx,
	args: {
		body: string;
		payload: ReversalWebhookPayload;
	}
) {
	try {
		return {
			ok: true as const,
			webhookEventId: await persistVerifiedTransferWebhook(ctx, {
				provider: args.payload.provider,
				providerEventId: args.payload.providerEventId,
				rawBody: args.body,
				normalizedEventType: "TRANSFER_REVERSED",
			}),
		};
	} catch (error) {
		console.error(
			"[Legacy Reversal Webhook] Failed to persist raw event:",
			error
		);
		return {
			ok: false as const,
			error:
				error instanceof Error
					? error.message
					: "legacy_reversal_persist_failed",
		};
	}
}

export async function scheduleLegacyReversalWebhookProcessing(
	ctx: ActionCtx,
	args: {
		payload: ReversalWebhookPayload;
		webhookEventId: Id<"webhookEvents">;
	}
) {
	try {
		await ctx.scheduler.runAfter(
			0,
			internal.payments.webhooks.legacyReversal.processLegacyReversalWebhook,
			args
		);
		return { ok: true as const };
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "legacy_reversal_scheduler_failed";
		console.error(
			"[Legacy Reversal Webhook] Failed to schedule processing:",
			error
		);
		await markTransferWebhookFailed(ctx, {
			webhookEventId: args.webhookEventId,
			error: message,
		});
		return { ok: false as const, error: message };
	}
}

export const processLegacyReversalWebhook = internalAction({
	args: {
		payload: reversalWebhookPayloadValidator,
		webhookEventId: v.id("webhookEvents"),
	},
	handler: async (ctx, args) => {
		try {
			const result = await handlePaymentReversal(ctx, args.payload);

			if (result.transferId) {
				await patchPersistedTransferWebhookMetadata(ctx, {
					webhookEventId: args.webhookEventId,
					normalizedEventType: "TRANSFER_REVERSED",
					transferRequestId: result.transferId,
				});
			}

			if (!result.success) {
				await markTransferWebhookFailed(ctx, {
					webhookEventId: args.webhookEventId,
					error: buildProcessingError(result),
				});
				return result;
			}

			await markTransferWebhookProcessed(ctx, args.webhookEventId);
			return result;
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "legacy_reversal_processing_failed";
			await markTransferWebhookFailed(ctx, {
				webhookEventId: args.webhookEventId,
				error: message,
			});
			throw error;
		}
	},
});
