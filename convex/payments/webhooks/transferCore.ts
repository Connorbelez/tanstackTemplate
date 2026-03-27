import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
	type ActionCtx,
	internalMutation,
	internalQuery,
} from "../../_generated/server";
import { providerCodeValidator } from "../transfers/validators";
import type {
	NormalizedTransferWebhookEventType,
	TransferWebhookMetadataPatch,
	TransferWebhookProcessingStatus,
} from "./types";

const TARGET_STATE_MAP: Record<NormalizedTransferWebhookEventType, string[]> = {
	FUNDS_SETTLED: ["confirmed"],
	TRANSFER_FAILED: ["failed"],
	TRANSFER_REVERSED: ["reversed"],
	PROCESSING_UPDATE: ["processing"],
};

export function isTransferAlreadyInTargetState(
	transferStatus: string,
	eventType: NormalizedTransferWebhookEventType
): boolean {
	return TARGET_STATE_MAP[eventType]?.includes(transferStatus) ?? false;
}

export const getTransferRequestByProviderRef = internalQuery({
	args: {
		providerCode: providerCodeValidator,
		providerRef: v.string(),
	},
	handler: async (ctx, args) => {
		return ctx.db
			.query("transferRequests")
			.withIndex("by_provider_ref", (q) =>
				q
					.eq("providerCode", args.providerCode)
					.eq("providerRef", args.providerRef)
			)
			.first();
	},
});

export const persistTransferWebhookEvent = internalMutation({
	args: {
		provider: v.string(),
		providerEventId: v.string(),
		rawBody: v.string(),
		signatureVerified: v.boolean(),
		normalizedEventType: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("webhookEvents")
			.withIndex("by_provider_event", (q) =>
				q
					.eq("provider", args.provider)
					.eq("providerEventId", args.providerEventId)
			)
			.first();

		if (existing) {
			const patch: {
				normalizedEventType?: string;
				signatureVerified?: boolean;
			} = {};

			if (existing.signatureVerified !== args.signatureVerified) {
				patch.signatureVerified = args.signatureVerified;
			}
			if (
				args.normalizedEventType !== undefined &&
				existing.normalizedEventType !== args.normalizedEventType
			) {
				patch.normalizedEventType = args.normalizedEventType;
			}
			if (Object.keys(patch).length > 0) {
				await ctx.db.patch(existing._id, patch);
			}
			return existing._id;
		}

		return ctx.db.insert("webhookEvents", {
			provider: args.provider,
			providerEventId: args.providerEventId,
			rawBody: args.rawBody,
			status: "pending",
			receivedAt: Date.now(),
			attempts: 0,
			signatureVerified: args.signatureVerified,
			normalizedEventType: args.normalizedEventType,
		});
	},
});

export const patchTransferWebhookMetadata = internalMutation({
	args: {
		webhookEventId: v.id("webhookEvents"),
		normalizedEventType: v.optional(v.string()),
		transferRequestId: v.optional(v.id("transferRequests")),
	},
	handler: async (ctx, args) => {
		const patch: TransferWebhookMetadataPatch = {};

		if (args.normalizedEventType !== undefined) {
			patch.normalizedEventType =
				args.normalizedEventType as NormalizedTransferWebhookEventType;
		}
		if (args.transferRequestId !== undefined) {
			patch.transferRequestId = args.transferRequestId;
		}

		if (Object.keys(patch).length === 0) {
			return;
		}

		await ctx.db.patch(args.webhookEventId, patch);
	},
});

export const updateTransferWebhookEventStatus = internalMutation({
	args: {
		webhookEventId: v.id("webhookEvents"),
		status: v.union(v.literal("processed"), v.literal("failed")),
		error: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const doc = await ctx.db.get(args.webhookEventId);
		if (!doc) {
			console.warn(
				`[transferWebhookCore] webhookEvent ${args.webhookEventId} not found for status update`
			);
			return;
		}

		const patch: {
			attempts: number;
			error?: string;
			processedAt: number;
			status: Exclude<TransferWebhookProcessingStatus, "pending">;
		} = {
			status: args.status,
			processedAt: Date.now(),
			attempts: doc.attempts + 1,
		};

		if (args.error !== undefined) {
			patch.error = args.error;
		}

		await ctx.db.patch(doc._id, patch);
	},
});

export async function persistVerifiedTransferWebhook(
	ctx: ActionCtx,
	args: {
		provider: string;
		providerEventId: string;
		rawBody: string;
		normalizedEventType?: NormalizedTransferWebhookEventType;
	}
): Promise<Id<"webhookEvents">> {
	return ctx.runMutation(
		internal.payments.webhooks.transferCore.persistTransferWebhookEvent,
		{
			...args,
			signatureVerified: true,
		}
	);
}

export async function patchPersistedTransferWebhookMetadata(
	ctx: ActionCtx,
	args: {
		webhookEventId: Id<"webhookEvents">;
		normalizedEventType?: NormalizedTransferWebhookEventType;
		transferRequestId?: Id<"transferRequests">;
	}
) {
	return ctx.runMutation(
		internal.payments.webhooks.transferCore.patchTransferWebhookMetadata,
		args
	);
}

export async function markTransferWebhookProcessed(
	ctx: ActionCtx,
	webhookEventId: Id<"webhookEvents">
) {
	return ctx.runMutation(
		internal.payments.webhooks.transferCore.updateTransferWebhookEventStatus,
		{
			webhookEventId,
			status: "processed",
		}
	);
}

export async function markTransferWebhookFailed(
	ctx: ActionCtx,
	args: {
		error: string;
		webhookEventId: Id<"webhookEvents">;
	}
) {
	return ctx.runMutation(
		internal.payments.webhooks.transferCore.updateTransferWebhookEventStatus,
		{
			webhookEventId: args.webhookEventId,
			status: "failed",
			error: args.error,
		}
	);
}
