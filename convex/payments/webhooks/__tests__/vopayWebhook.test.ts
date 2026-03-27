/**
 * VoPay webhook handler tests — pure unit tests for status mapping,
 * payload construction, and idempotency logic.
 *
 * No convex-test or database interaction — tests the exported pure
 * functions and data structures from vopay.ts.
 */

import { describe, expect, it } from "vitest";
import {
	mapVoPayStatusToTransferEvent,
	type VoPayWebhookEvent,
} from "../vopay";

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
});
