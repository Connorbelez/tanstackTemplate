import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { httpAction, internalAction } from "../../_generated/server";
import {
	markTransferWebhookFailed,
	persistVerifiedTransferWebhook,
} from "./transferCore";
import { jsonResponse } from "./utils";
import type { VerificationResult } from "./verification";

// ── Stripe-specific types ───────────────────────────────────────────

export interface StripeWebhookEvent {
	created: number;
	data: {
		object: {
			amount: number;
			charge?: string;
			failure_code?: string;
			failure_message?: string;
			id: string;
			metadata?: Record<string, string>;
			payment_intent?: string;
			reason?: string;
			status?: string;
		};
	};
	id: string;
	type: string;
}

interface StripeReversalPayload {
	originalAmount: number;
	provider: "stripe";
	providerEventId: string;
	providerRef: string;
	reversalCode?: string;
	reversalDate: string;
	reversalReason: string;
}

const UNSUPPORTED_PROVIDER_ERROR = "unsupported_provider";

// ── Constants ───────────────────────────────────────────────────────

export const REVERSAL_EVENT_TYPES = new Set([
	"charge.dispute.created",
	"charge.refunded",
	"payment_intent.payment_failed",
]);

const stripeUnsupportedWebhookArgsValidator = v.object({
	providerEventId: v.string(),
	webhookEventId: v.id("webhookEvents"),
});

// ── Helpers ─────────────────────────────────────────────────────────

export function extractProviderRef(event: StripeWebhookEvent): string {
	const obj = event.data.object;

	switch (event.type) {
		case "charge.refunded":
			return obj.metadata?.provider_ref ?? obj.metadata?.providerRef ?? obj.id;
		case "charge.dispute.created":
			return obj.charge ?? obj.id;
		case "payment_intent.payment_failed":
			return obj.id;
		default:
			return obj.id;
	}
}

export function buildReversalReason(event: StripeWebhookEvent): string {
	const obj = event.data.object;

	switch (event.type) {
		case "charge.refunded":
			return `ACH Return: ${obj.reason ?? obj.status ?? "refunded"}`;
		case "charge.dispute.created":
			return `Dispute: ${obj.reason ?? "opened"}`;
		case "payment_intent.payment_failed":
			return `ACH Failure: ${obj.failure_code ?? "unknown"} — ${obj.failure_message ?? ""}`;
		default:
			return "Unknown reversal";
	}
}

export function buildReversalCode(
	event: StripeWebhookEvent
): string | undefined {
	const obj = event.data.object;

	switch (event.type) {
		case "charge.refunded":
			return obj.reason ?? "REFUND";
		case "charge.dispute.created":
			return "DISPUTE";
		case "payment_intent.payment_failed":
			return obj.failure_code;
		default:
			return undefined;
	}
}

export function toPayload(event: StripeWebhookEvent): StripeReversalPayload {
	const reversalDate = new Date(event.created * 1000)
		.toISOString()
		.slice(0, 10);

	return {
		originalAmount: event.data.object.amount,
		provider: "stripe",
		providerEventId: event.id,
		providerRef: extractProviderRef(event),
		reversalCode: buildReversalCode(event),
		reversalDate,
		reversalReason: buildReversalReason(event),
	};
}

async function persistStripeWebhook(
	ctx: Parameters<typeof persistVerifiedTransferWebhook>[0],
	args: {
		body: string;
		normalizedEventType?: "TRANSFER_REVERSED";
		providerEventId: string;
	}
) {
	try {
		return {
			ok: true as const,
			webhookEventId: await persistVerifiedTransferWebhook(ctx, {
				provider: "stripe",
				providerEventId: args.providerEventId,
				rawBody: args.body,
				normalizedEventType: args.normalizedEventType,
			}),
		};
	} catch (error) {
		console.error("[Stripe Webhook] Failed to persist raw event:", error);
		return {
			ok: false as const,
			error:
				error instanceof Error
					? error.message
					: "stripe_webhook_persist_failed",
		};
	}
}

async function scheduleUnsupportedStripeWebhookProcessing(
	ctx: Parameters<typeof persistVerifiedTransferWebhook>[0],
	args: {
		providerEventId: string;
		webhookEventId: Id<"webhookEvents">;
	}
) {
	try {
		await ctx.scheduler.runAfter(
			0,
			internal.payments.webhooks.stripe.processUnsupportedStripeWebhook,
			args
		);
		return { ok: true as const };
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "stripe_webhook_scheduler_failed";
		console.error("[Stripe Webhook] Failed to schedule processing:", error);
		await markTransferWebhookFailed(ctx, {
			webhookEventId: args.webhookEventId,
			error: message,
		});
		return { ok: false as const, error: message };
	}
}

export const processUnsupportedStripeWebhook = internalAction({
	args: stripeUnsupportedWebhookArgsValidator,
	handler: async (ctx, args) => {
		console.warn(
			`[Stripe Webhook] Provider event ${args.providerEventId} is persisted but still unsupported for automated reversal processing.`
		);
		await markTransferWebhookFailed(ctx, {
			webhookEventId: args.webhookEventId,
			error: UNSUPPORTED_PROVIDER_ERROR,
		});
		return {
			success: false,
			reason: UNSUPPORTED_PROVIDER_ERROR,
			providerEventId: args.providerEventId,
		};
	},
});

// ── HTTP Action ─────────────────────────────────────────────────────

export const stripeWebhook = httpAction(async (ctx, request) => {
	const body = await request.text();
	const signatureHeader = request.headers.get("stripe-signature");

	// 1. Verify signature (delegates to Node runtime via internalAction)
	if (!signatureHeader) {
		console.warn("[Stripe Webhook] Missing signature header");
		return jsonResponse({ error: "invalid_signature" }, 401);
	}

	const verification: VerificationResult = await ctx.runAction(
		internal.payments.webhooks.verification.verifyStripeSignatureAction,
		{ body, signatureHeader }
	);

	if (!verification.ok) {
		if (verification.error === "missing_secret") {
			console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
			return jsonResponse({ error: "server_configuration_error" }, 500);
		}
		console.warn("[Stripe Webhook] Signature verification failed");
		return jsonResponse({ error: "invalid_signature" }, 401);
	}

	// 2. Parse event
	let event: StripeWebhookEvent;
	try {
		event = JSON.parse(body) as StripeWebhookEvent;
	} catch {
		console.warn("[Stripe Webhook] Malformed JSON body");
		return jsonResponse({ error: "malformed_json" }, 400);
	}

	// 3. Filter for reversal events only
	if (!REVERSAL_EVENT_TYPES.has(event.type)) {
		return jsonResponse({ ignored: true, event_type: event.type });
	}

	// Foot Gun P4: Log warning for disputes
	if (event.type === "charge.dispute.created") {
		console.warn(
			`[Stripe Webhook] DISPUTE received for ${event.data.object.id}. ` +
				"Manual review may be required."
		);
	}

	// 4. Build the normalized payload for logging/response metadata.
	const payload = toPayload(event);

	const persisted = await persistStripeWebhook(ctx, {
		body,
		normalizedEventType: "TRANSFER_REVERSED",
		providerEventId: payload.providerEventId,
	});
	if (!persisted.ok) {
		return jsonResponse({ error: persisted.error }, 500);
	}

	const scheduled = await scheduleUnsupportedStripeWebhookProcessing(ctx, {
		providerEventId: payload.providerEventId,
		webhookEventId: persisted.webhookEventId,
	});
	if (!scheduled.ok) {
		return jsonResponse({ error: scheduled.error }, 500);
	}

	return jsonResponse({
		accepted: true,
		processing: "deferred",
		reason: UNSUPPORTED_PROVIDER_ERROR,
		providerEventId: payload.providerEventId,
	});
});
