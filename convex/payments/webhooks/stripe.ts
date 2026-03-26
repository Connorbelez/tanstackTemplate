import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import { handlePaymentReversal } from "./handleReversal";
import type { ReversalWebhookPayload } from "./types";
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

// ── Constants ───────────────────────────────────────────────────────

export const REVERSAL_EVENT_TYPES = new Set([
	"charge.dispute.created",
	"charge.refunded",
	"payment_intent.payment_failed",
]);

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

export function toPayload(event: StripeWebhookEvent): ReversalWebhookPayload {
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

	// 4. Map to payload and process
	const payload = toPayload(event);

	try {
		const result = await handlePaymentReversal(ctx, payload);
		return jsonResponse({ ...result });
	} catch (err) {
		// Always return 200 for processing errors to prevent Stripe retry storms.
		// Non-200 responses are reserved for signature/JSON validation failures only.
		console.error("[Stripe Webhook] Reversal processing failed:", err);
		return jsonResponse({
			error: "processing_failed",
			message: err instanceof Error ? err.message : "Unknown error",
			providerEventId: payload.providerEventId,
		});
	}
});
