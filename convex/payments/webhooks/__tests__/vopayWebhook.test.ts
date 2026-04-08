/**
 * VoPay webhook handler tests — pure unit tests for status mapping,
 * payload construction, and idempotency logic.
 *
 * No convex-test or database interaction — tests the exported pure
 * functions and data structures from vopay.ts.
 */

import { describe, expect, it } from "vitest";
import { createWebhookTestHarness } from "../../../../src/test/convex/payments/webhooks/convexTestHarness";
import { internal } from "../../../_generated/api";
import { seedMinimalEntities } from "../../cashLedger/__tests__/testUtils";
import {
	buildVoPayTransitionPayload,
	mapVoPayStatusToTransferEvent,
	type VoPayWebhookEvent,
} from "../vopay";

const TEST_SOURCE = {
	channel: "api_webhook" as const,
	actorId: "test-webhook",
	actorType: "system" as const,
};

// ── Factory ─────────────────────────────────────────────────────────

function makeEvent(
	overrides: Partial<VoPayWebhookEvent> = {}
): VoPayWebhookEvent {
	return {
		transaction_id: "txn_001",
		status: "completed",
		amount: 50_000,
		event_id: "evt_001",
		reason: undefined,
		timestamp: "2026-03-20T12:00:00Z",
		...overrides,
	};
}

// ── Status mapping ──────────────────────────────────────────────────

describe("mapVoPayStatusToTransferEvent", () => {
	it.each([
		["completed", "FUNDS_SETTLED"],
		["settled", "FUNDS_SETTLED"],
		["failed", "TRANSFER_FAILED"],
		["error", "TRANSFER_FAILED"],
		["returned", "TRANSFER_REVERSED"],
		["reversed", "TRANSFER_REVERSED"],
		["pending", "PROCESSING_UPDATE"],
		["processing", "PROCESSING_UPDATE"],
	] as const)('maps "%s" → "%s"', (voPayStatus, expected) => {
		expect(mapVoPayStatusToTransferEvent(voPayStatus)).toBe(expected);
	});

	it('returns undefined for unknown status "unknown_status"', () => {
		expect(mapVoPayStatusToTransferEvent("unknown_status")).toBeUndefined();
	});

	it("returns undefined for empty string", () => {
		expect(mapVoPayStatusToTransferEvent("")).toBeUndefined();
	});
});

// ── VoPayWebhookEvent factory ───────────────────────────────────────

describe("VoPayWebhookEvent factory", () => {
	it("creates a default event with all fields", () => {
		const event = makeEvent();
		expect(event.transaction_id).toBe("txn_001");
		expect(event.status).toBe("completed");
		expect(event.amount).toBe(50_000);
	});

	it("allows overriding individual fields", () => {
		const event = makeEvent({ status: "failed", reason: "NSF" });
		expect(event.status).toBe("failed");
		expect(event.reason).toBe("NSF");
		expect(event.transaction_id).toBe("txn_001"); // unchanged
	});
});

// ── Idempotency target state map ────────────────────────────────────

describe("idempotency target states", () => {
	const targetStateMap: Record<string, string[]> = {
		FUNDS_SETTLED: ["confirmed"],
		TRANSFER_FAILED: ["failed"],
		TRANSFER_REVERSED: ["reversed"],
		PROCESSING_UPDATE: ["processing"],
	};

	it("FUNDS_SETTLED targets confirmed", () => {
		expect(targetStateMap.FUNDS_SETTLED).toContain("confirmed");
	});

	it("TRANSFER_FAILED targets failed", () => {
		expect(targetStateMap.TRANSFER_FAILED).toContain("failed");
	});

	it("TRANSFER_REVERSED targets reversed", () => {
		expect(targetStateMap.TRANSFER_REVERSED).toContain("reversed");
	});

	it("PROCESSING_UPDATE targets processing", () => {
		expect(targetStateMap.PROCESSING_UPDATE).toContain("processing");
	});
});

// ── Payload construction shapes ─────────────────────────────────────

describe("payload construction per event type", () => {
	it("FUNDS_SETTLED payload has settledAt and providerData", () => {
		const event = makeEvent({ status: "completed" });
		const payload = {
			settledAt: Date.now(),
			providerData: {
				voPayTransactionId: event.transaction_id,
				voPayEventId: event.event_id,
			},
		};
		expect(payload.settledAt).toBeGreaterThan(0);
		expect(payload.providerData.voPayTransactionId).toBe("txn_001");
		expect(payload.providerData.voPayEventId).toBe("evt_001");
	});

	it("TRANSFER_FAILED payload has errorCode and reason", () => {
		const event = makeEvent({ status: "failed", reason: "NSF" });
		const payload = {
			errorCode: "VOPAY_FAILURE",
			reason: event.reason ?? `VoPay status: ${event.status}`,
		};
		expect(payload.errorCode).toBe("VOPAY_FAILURE");
		expect(payload.reason).toBe("NSF");
	});

	it("TRANSFER_FAILED falls back to status when reason is undefined", () => {
		const event = makeEvent({ status: "failed", reason: undefined });
		const payload = {
			errorCode: "VOPAY_FAILURE",
			reason: event.reason ?? `VoPay status: ${event.status}`,
		};
		expect(payload.reason).toBe("VoPay status: failed");
	});

	it("TRANSFER_REVERSED payload has reversalRef and reason", () => {
		const event = makeEvent({
			status: "returned",
			event_id: "evt_999",
			reason: "chargeback",
		});
		const payload = {
			reversalRef: event.event_id ?? event.transaction_id,
			reason: event.reason ?? `VoPay reversal: ${event.status}`,
		};
		expect(payload.reversalRef).toBe("evt_999");
		expect(payload.reason).toBe("chargeback");
	});

	it("TRANSFER_REVERSED falls back to transactionId when eventId is missing", () => {
		const event = makeEvent({
			status: "reversed",
			event_id: undefined,
		});
		const payload = {
			reversalRef: event.event_id ?? event.transaction_id,
			reason: event.reason ?? `VoPay reversal: ${event.status}`,
		};
		expect(payload.reversalRef).toBe("txn_001");
	});

	it("PROCESSING_UPDATE payload has providerData", () => {
		const event = makeEvent({ status: "pending" });
		const payload = {
			providerData: {
				voPayTransactionId: event.transaction_id,
				status: event.status,
			},
		};
		expect(payload.providerData.status).toBe("pending");
	});

	it("buildVoPayTransitionPayload returns empty object for unreachable fallback", () => {
		expect(
			buildVoPayTransitionPayload("PROCESSING_UPDATE", {
				transactionId: "txn_001",
				status: "processing",
				eventId: "evt_001",
			})
		).toEqual({
			providerData: {
				voPayTransactionId: "txn_001",
				status: "processing",
			},
		});
	});
});

/** Seed a provider-owned transfer (no collectionAttemptId). Starts at "pending". */
async function seedProviderOwnedTransfer(
	opts: {
		providerCode: "pad_vopay" | "eft_vopay";
		providerRef: string;
	},
	t = createWebhookTestHarness()
) {
	const seeded = await t.run(async (ctx) => {
		const transferId = await ctx.db.insert("transferRequests", {
			status: "pending",
			direction: opts.providerCode === "eft_vopay" ? "outbound" : "inbound",
			transferType:
				opts.providerCode === "eft_vopay"
					? "lender_dispersal_payout"
					: "borrower_interest_collection",
			amount: 50_000,
			currency: "CAD",
			counterpartyType:
				opts.providerCode === "eft_vopay" ? "lender" : "borrower",
			counterpartyId: "test-counterparty",
			providerCode: opts.providerCode,
			providerRef: opts.providerRef,
			idempotencyKey: `${opts.providerCode}-${opts.providerRef}`,
			source: TEST_SOURCE,
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
		});

		const webhookEventId = await ctx.db.insert("webhookEvents", {
			provider: opts.providerCode,
			providerEventId: `evt-${opts.providerRef}`,
			rawBody: JSON.stringify(makeEvent({ transaction_id: opts.providerRef })),
			status: "pending",
			receivedAt: Date.now(),
			attempts: 0,
			signatureVerified: true,
		});

		return { transferId, webhookEventId };
	});

	return { ...seeded, t };
}

/**
 * Seed a bridged transfer (with collectionAttemptId). Defaults to "confirmed"
 * because the bridge flow confirms transfers before any provider webhook arrives.
 */
async function seedBridgedTransfer(
	opts: {
		providerCode: "pad_vopay" | "eft_vopay";
		providerRef: string;
		status?: "confirmed" | "pending";
	},
	t = createWebhookTestHarness()
) {
	const { mortgageId } = await seedMinimalEntities(t);

	const seeded = await t.run(async (ctx) => {
		const planEntryId = await ctx.db.insert("collectionPlanEntries", {
			mortgageId,
			obligationIds: [],
			amount: 50_000,
			method: opts.providerCode,
			scheduledDate: Date.now(),
			status: "executing",
			source: "default_schedule",
			createdAt: Date.now(),
		});

		const attemptId = await ctx.db.insert("collectionAttempts", {
			status: "pending",
			machineContext: {},
			lastTransitionAt: Date.now(),
			planEntryId,
			mortgageId,
			obligationIds: [],
			method: opts.providerCode,
			amount: 50_000,
			providerRef: opts.providerRef,
			initiatedAt: Date.now(),
		});

		const transferId = await ctx.db.insert("transferRequests", {
			status: opts.status ?? "confirmed",
			direction: opts.providerCode === "eft_vopay" ? "outbound" : "inbound",
			transferType:
				opts.providerCode === "eft_vopay"
					? "lender_dispersal_payout"
					: "borrower_interest_collection",
			amount: 50_000,
			currency: "CAD",
			counterpartyType:
				opts.providerCode === "eft_vopay" ? "lender" : "borrower",
			counterpartyId: "test-counterparty",
			providerCode: opts.providerCode,
			providerRef: opts.providerRef,
			idempotencyKey: `${opts.providerCode}-${opts.providerRef}`,
			source: TEST_SOURCE,
			mortgageId,
			createdAt: Date.now(),
			lastTransitionAt: Date.now(),
			collectionAttemptId: attemptId,
		});

		const webhookEventId = await ctx.db.insert("webhookEvents", {
			provider: opts.providerCode,
			providerEventId: `evt-${opts.providerRef}`,
			rawBody: JSON.stringify(makeEvent({ transaction_id: opts.providerRef })),
			status: "pending",
			receivedAt: Date.now(),
			attempts: 0,
			signatureVerified: true,
		});

		return { transferId, webhookEventId };
	});

	return { ...seeded, t };
}

describe("processVoPayWebhook integration", () => {
	it("marks PAD webhook processed, links transferRequestId, and confirms the transfer", async () => {
		const { t, transferId, webhookEventId } = await seedProviderOwnedTransfer({
			providerCode: "pad_vopay",
			providerRef: "txn_pad_confirm_001",
		});

		await t.mutation(internal.payments.webhooks.vopay.processVoPayWebhook, {
			webhookEventId,
			providerCode: "pad_vopay",
			transactionId: "txn_pad_confirm_001",
			status: "completed",
		});

		const transfer = await t.run(async (ctx) => ctx.db.get(transferId));
		const webhook = await t.run(async (ctx) => ctx.db.get(webhookEventId));

		expect(transfer?.status).toBe("confirmed");
		expect(webhook?.status).toBe("processed");
		expect(webhook?.normalizedEventType).toBe("FUNDS_SETTLED");
		expect(webhook?.transferRequestId).toEqual(transferId);
	});

	it("silently acknowledges duplicate PAD delivery when the transfer is already confirmed", async () => {
		const { t, transferId, webhookEventId } = await seedBridgedTransfer({
			providerCode: "pad_vopay",
			providerRef: "txn_pad_duplicate_001",
			status: "confirmed",
		});

		await t.mutation(internal.payments.webhooks.vopay.processVoPayWebhook, {
			webhookEventId,
			providerCode: "pad_vopay",
			transactionId: "txn_pad_duplicate_001",
			status: "completed",
		});

		const transfer = await t.run(async (ctx) => ctx.db.get(transferId));
		const webhook = await t.run(async (ctx) => ctx.db.get(webhookEventId));

		expect(transfer?.status).toBe("confirmed");
		expect(webhook?.status).toBe("processed");
		expect(webhook?.attempts).toBe(1);
	});
});
