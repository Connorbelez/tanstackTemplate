/**
 * VoPay webhook handler skeleton — Phase 1 foundation.
 *
 * Receives PAD status notifications from VoPay, verifies the HMAC-SHA256
 * signature, and processes the event via an internal mutation.
 *
 * This is a SKELETON: VoPay payload parsing uses placeholder field names
 * and status mappings. Phase 2 (ENG-185) fills in real VoPay payload format.
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { httpAction, internalMutation } from "../../_generated/server";
import { auditLog } from "../../auditLog";
import { executeTransition } from "../../engine/transition";
import type { CommandSource } from "../../engine/types";
import { jsonResponse } from "./utils";
import type { VerificationResult } from "./verification";

// ── VoPay-specific types (placeholder — TBD by ENG-185) ────────────

/** Placeholder VoPay webhook event structure. */
export interface VoPayWebhookEvent {
	/** Amount value from VoPay — unit (dollars vs cents) TBD (ENG-185) */
	amount?: number;
	/** VoPay-assigned event identifier for idempotency */
	event_id?: string;
	/** Reason for failure/return */
	reason?: string;
	/** VoPay event/status string (e.g., "completed", "failed", "returned") */
	status: string;
	/** ISO 8601 timestamp */
	timestamp?: string;
	/** VoPay transaction reference */
	transaction_id: string;
}

// ── Placeholder status mapping ─────────────────────────────────────

/**
 * Maps a VoPay webhook status to a transfer machine event type.
 * Returns undefined for statuses we don't act on.
 *
 * Placeholder mapping — real VoPay status values TBD (ENG-185).
 */
export function mapVoPayStatusToTransferEvent(
	voPayStatus: string
): string | undefined {
	switch (voPayStatus) {
		case "completed":
		case "settled":
			return "FUNDS_SETTLED";
		case "failed":
		case "error":
			return "TRANSFER_FAILED";
		case "returned":
		case "reversed":
			return "TRANSFER_REVERSED";
		case "pending":
		case "processing":
			return "PROCESSING_UPDATE";
		default:
			return undefined;
	}
}

// ── HTTP Action ─────────────────────────────────────────────────────

export const vopayWebhook = httpAction(async (ctx, request) => {
	const body = await request.text();
	const signature = request.headers.get("X-VoPay-Signature");

	// 1. Verify signature (delegates to Node runtime via internalAction)
	if (!signature) {
		console.warn("[VoPay Webhook] Missing signature header");
		return jsonResponse({ error: "invalid_signature" }, 401);
	}

	const verification: VerificationResult = await ctx.runAction(
		internal.payments.webhooks.verification.verifyVoPaySignatureAction,
		{ body, signature }
	);

	if (!verification.ok) {
		if (verification.error === "missing_secret") {
			console.error("[VoPay Webhook] VOPAY_WEBHOOK_SECRET not configured");
			return jsonResponse({ error: "server_configuration_error" }, 500);
		}
		console.warn("[VoPay Webhook] Signature verification failed");
		return jsonResponse({ error: "invalid_signature" }, 401);
	}

	// 2. Parse event
	let event: VoPayWebhookEvent;
	try {
		event = JSON.parse(body) as VoPayWebhookEvent;
	} catch (err) {
		console.warn(
			"[VoPay Webhook] Malformed JSON body:",
			err instanceof Error ? err.message : err
		);
		return jsonResponse({ error: "malformed_json" }, 400);
	}

	if (!(event.transaction_id && event.status)) {
		console.warn(
			"[VoPay Webhook] Missing required fields: transaction_id or status"
		);
		return jsonResponse({ error: "missing_required_fields" }, 400);
	}

	// 3. Process webhook event (inline via runMutation)
	// Always return 200 to prevent VoPay retry storms.
	// Non-200 responses are reserved for signature/JSON parsing failures only.
	try {
		await ctx.runMutation(
			internal.payments.webhooks.vopay.processVoPayWebhook,
			{
				transactionId: event.transaction_id,
				status: event.status,
				amount: event.amount,
				reason: event.reason,
				eventId: event.event_id,
				timestamp: event.timestamp,
			}
		);
		return jsonResponse({ accepted: true });
	} catch (err) {
		console.error("[VoPay Webhook] Processing failed:", err);
		return jsonResponse({
			accepted: true,
			error: "processing_failed",
			message: err instanceof Error ? err.message : "Unknown error",
		});
	}
});

// ── Processing mutation ─────────────────────────────────────────────

/**
 * Process VoPay webhook event: look up transfer, map status, fire transition.
 *
 * Skeleton implementation — placeholder field parsing. Real VoPay payload
 * parsing will be implemented in ENG-185.
 */
export const processVoPayWebhook = internalMutation({
	args: {
		transactionId: v.string(),
		status: v.string(),
		amount: v.optional(v.number()),
		reason: v.optional(v.string()),
		eventId: v.optional(v.string()),
		timestamp: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// 1. Look up transfer by providerCode + providerRef
		const transfer = await ctx.db
			.query("transferRequests")
			.withIndex("by_provider_ref", (q) =>
				q.eq("providerCode", "pad_vopay").eq("providerRef", args.transactionId)
			)
			.first();

		if (!transfer) {
			console.warn(
				`[VoPay Webhook] No transfer found for providerCode=pad_vopay, providerRef=${args.transactionId}`
			);
			return;
		}

		// 2. Map VoPay status to transfer event
		const eventType = mapVoPayStatusToTransferEvent(args.status);
		if (!eventType) {
			console.info(
				`[VoPay Webhook] Ignoring unmapped status="${args.status}" for transfer=${transfer._id}`
			);
			return;
		}

		// 3. Idempotency: if transfer already in target state, return success
		const targetStateMap: Record<string, string[]> = {
			FUNDS_SETTLED: ["confirmed"],
			TRANSFER_FAILED: ["failed"],
			TRANSFER_REVERSED: ["reversed"],
			PROCESSING_UPDATE: ["processing"],
		};

		const targetStates = targetStateMap[eventType];
		if (targetStates?.includes(transfer.status)) {
			console.info(
				`[VoPay Webhook] Transfer ${transfer._id} already in target state "${transfer.status}" — idempotent skip`
			);
			return;
		}

		// 4. Build event payload based on event type
		const source: CommandSource = {
			actorType: "system",
			channel: "api_webhook",
		};

		let payload: Record<string, unknown> = {};

		switch (eventType) {
			case "FUNDS_SETTLED":
				payload = {
					settledAt: Date.now(),
					providerData: {
						voPayTransactionId: args.transactionId,
						voPayEventId: args.eventId,
					},
				};
				break;
			case "TRANSFER_FAILED":
				payload = {
					errorCode: "VOPAY_FAILURE",
					reason: args.reason ?? `VoPay status: ${args.status}`,
				};
				break;
			case "TRANSFER_REVERSED":
				payload = {
					reversalRef: args.eventId ?? args.transactionId,
					reason: args.reason ?? `VoPay reversal: ${args.status}`,
				};
				break;
			case "PROCESSING_UPDATE":
				payload = {
					providerData: {
						voPayTransactionId: args.transactionId,
						status: args.status,
					},
				};
				break;
			default:
				break;
		}

		// 5. Fire transition via the Governed Transition engine
		const result = await executeTransition(ctx, {
			entityType: "transfer",
			entityId: transfer._id,
			eventType,
			payload,
			source,
		});

		if (!result.success) {
			console.error(
				`[VoPay Webhook] Transition failed for transfer=${transfer._id}, ` +
					`event=${eventType}: ${result.reason ?? "unknown"}`
			);

			await auditLog.log(ctx, {
				action: "webhook.vopay.transition_failed",
				actorId: "system",
				resourceType: "transferRequests",
				resourceId: transfer._id,
				severity: "error",
				metadata: {
					eventType,
					voPayStatus: args.status,
					transactionId: args.transactionId,
					reason: result.reason,
				},
			});
		}
	},
});
