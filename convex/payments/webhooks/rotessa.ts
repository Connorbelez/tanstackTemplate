import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import {
	persistLegacyReversalWebhook,
	scheduleLegacyReversalWebhookProcessing,
} from "./legacyReversal";
import type { ReversalWebhookPayload } from "./types";
import { jsonResponse } from "./utils";
import type { VerificationResult } from "./verification";

// ── Rotessa-specific types ──────────────────────────────────────────

export interface RotessaWebhookEvent {
	data: {
		amount: number;
		date?: string;
		event_id?: string;
		reason?: string;
		return_code?: string;
		transaction_id: string;
	};
	event_type: string;
}

// ── Constants ───────────────────────────────────────────────────────

export const REVERSAL_EVENT_TYPES = new Set([
	"transaction.nsf",
	"transaction.returned",
	"transaction.reversed",
]);

// ── Helpers ─────────────────────────────────────────────────────────

export function buildReversalReason(event: RotessaWebhookEvent): string {
	const { event_type, data } = event;

	switch (event_type) {
		case "transaction.nsf":
			return `NSF: ${data.reason ?? "Non-Sufficient Funds"}`;
		case "transaction.returned":
			return `PAD Return: ${data.return_code ?? "unknown"} — ${data.reason ?? ""}`;
		case "transaction.reversed":
			return `Manual Reversal: ${data.reason ?? ""}`;
		default:
			return data.reason ?? "Unknown reversal";
	}
}

export function buildReversalCode(
	event: RotessaWebhookEvent
): string | undefined {
	switch (event.event_type) {
		case "transaction.nsf":
			return "NSF";
		case "transaction.returned":
			return event.data.return_code;
		case "transaction.reversed":
			return "MANUAL_REVERSAL";
		default:
			return undefined;
	}
}

export function toPayload(event: RotessaWebhookEvent): ReversalWebhookPayload {
	const today = new Date().toISOString().slice(0, 10);

	return {
		originalAmount: Math.round((event.data.amount + Number.EPSILON) * 100),
		provider: "rotessa",
		providerEventId: event.data.event_id ?? event.data.transaction_id,
		providerRef: event.data.transaction_id,
		reversalCode: buildReversalCode(event),
		reversalDate: event.data.date ?? today,
		reversalReason: buildReversalReason(event),
	};
}

// ── HTTP Action ─────────────────────────────────────────────────────

export const rotessaWebhook = httpAction(async (ctx, request) => {
	const body = await request.text();
	const signature = request.headers.get("X-Rotessa-Signature");

	// 1. Verify signature (delegates to Node runtime via internalAction)
	if (!signature) {
		console.warn("[Rotessa Webhook] Missing signature header");
		return jsonResponse({ error: "invalid_signature" }, 401);
	}

	const verification: VerificationResult = await ctx.runAction(
		internal.payments.webhooks.verification.verifyRotessaSignatureAction,
		{ body, signature }
	);

	if (!verification.ok) {
		if (verification.error === "missing_secret") {
			console.error("[Rotessa Webhook] ROTESSA_WEBHOOK_SECRET not configured");
			return jsonResponse({ error: "server_configuration_error" }, 500);
		}
		console.warn("[Rotessa Webhook] Signature verification failed");
		return jsonResponse({ error: "invalid_signature" }, 401);
	}

	// 2. Parse event
	let event: RotessaWebhookEvent;
	try {
		event = JSON.parse(body) as RotessaWebhookEvent;
	} catch {
		console.warn("[Rotessa Webhook] Malformed JSON body");
		return jsonResponse({ error: "malformed_json" }, 400);
	}

	// 3. Filter for reversal events only
	if (!REVERSAL_EVENT_TYPES.has(event.event_type)) {
		return jsonResponse({ ignored: true, event_type: event.event_type });
	}

	// 4. Map to payload, persist, and schedule processing
	const payload = toPayload(event);
	const persisted = await persistLegacyReversalWebhook(ctx, { body, payload });
	if (!persisted.ok) {
		return jsonResponse(
			{
				error: "persistence_failed",
				message: persisted.error,
				providerEventId: payload.providerEventId,
			},
			500
		);
	}

	const scheduled = await scheduleLegacyReversalWebhookProcessing(ctx, {
		payload,
		webhookEventId: persisted.webhookEventId,
	});
	if (!scheduled.ok) {
		return jsonResponse(
			{
				error: "scheduler_failed",
				message: scheduled.error,
				providerEventId: payload.providerEventId,
			},
			500
		);
	}

	return jsonResponse({
		accepted: true,
		providerEventId: payload.providerEventId,
	});
});
