import { describe, expect, it } from "vitest";
import type { RotessaWebhookEvent } from "../rotessa";
import {
	buildReversalCode,
	buildReversalReason,
	REVERSAL_EVENT_TYPES,
	toPayload,
} from "../rotessa";

// ── Constants ────────────────────────────────────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ── Helpers ──────────────────────────────────────────────────────────

function makeEvent(
	overrides: Partial<RotessaWebhookEvent> & { event_type: string }
): RotessaWebhookEvent {
	return {
		data: {
			amount: 150.0,
			transaction_id: "txn_001",
			...(overrides.data ?? {}),
		},
		event_type: overrides.event_type,
	};
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Rotessa webhook handler", () => {
	// ── Event filtering ──────────────────────────────────────────────

	describe("event type filtering", () => {
		it("recognizes transaction.nsf as a reversal event", () => {
			expect(REVERSAL_EVENT_TYPES.has("transaction.nsf")).toBe(true);
		});

		it("recognizes transaction.returned as a reversal event", () => {
			expect(REVERSAL_EVENT_TYPES.has("transaction.returned")).toBe(true);
		});

		it("recognizes transaction.reversed as a reversal event", () => {
			expect(REVERSAL_EVENT_TYPES.has("transaction.reversed")).toBe(true);
		});

		it("does not recognize transaction.created as a reversal event", () => {
			expect(REVERSAL_EVENT_TYPES.has("transaction.created")).toBe(false);
		});

		it("does not recognize transaction.completed as a reversal event", () => {
			expect(REVERSAL_EVENT_TYPES.has("transaction.completed")).toBe(false);
		});

		it("contains exactly 3 event types", () => {
			expect(REVERSAL_EVENT_TYPES.size).toBe(3);
		});
	});

	// ── Payload mapping ──────────────────────────────────────────────

	describe("toPayload", () => {
		it("converts dollar amounts to cents correctly", () => {
			const event = makeEvent({
				event_type: "transaction.nsf",
				data: { amount: 150.75, transaction_id: "txn_001" },
			});
			const payload = toPayload(event);
			expect(payload.originalAmount).toBe(15_075);
		});

		it("handles whole dollar amounts", () => {
			const event = makeEvent({
				event_type: "transaction.nsf",
				data: { amount: 200, transaction_id: "txn_002" },
			});
			const payload = toPayload(event);
			expect(payload.originalAmount).toBe(20_000);
		});

		it("extracts providerRef from transaction_id", () => {
			const event = makeEvent({
				event_type: "transaction.nsf",
				data: { amount: 100, transaction_id: "txn_abc_123" },
			});
			const payload = toPayload(event);
			expect(payload.providerRef).toBe("txn_abc_123");
		});

		it("uses event_id for providerEventId when present", () => {
			const event = makeEvent({
				event_type: "transaction.nsf",
				data: {
					amount: 100,
					transaction_id: "txn_001",
					event_id: "evt_rotessa_456",
				},
			});
			const payload = toPayload(event);
			expect(payload.providerEventId).toBe("evt_rotessa_456");
		});

		it("falls back to transaction_id for providerEventId when event_id missing", () => {
			const event = makeEvent({
				event_type: "transaction.nsf",
				data: { amount: 100, transaction_id: "txn_001" },
			});
			const payload = toPayload(event);
			expect(payload.providerEventId).toBe("txn_001");
		});

		it("sets provider to rotessa", () => {
			const event = makeEvent({ event_type: "transaction.nsf" });
			const payload = toPayload(event);
			expect(payload.provider).toBe("rotessa");
		});

		it("uses data.date for reversalDate when present", () => {
			const event = makeEvent({
				event_type: "transaction.nsf",
				data: {
					amount: 100,
					transaction_id: "txn_001",
					date: "2026-03-15",
				},
			});
			const payload = toPayload(event);
			expect(payload.reversalDate).toBe("2026-03-15");
		});

		it("falls back to today when data.date is missing", () => {
			const event = makeEvent({
				event_type: "transaction.nsf",
				data: { amount: 100, transaction_id: "txn_001" },
			});
			const payload = toPayload(event);
			// Should be a YYYY-MM-DD string for today
			expect(payload.reversalDate).toMatch(DATE_PATTERN);
		});
	});

	// ── Reason mapping ───────────────────────────────────────────────

	describe("buildReversalReason", () => {
		it("maps NSF reason correctly", () => {
			const event = makeEvent({
				event_type: "transaction.nsf",
				data: { amount: 100, transaction_id: "txn_001" },
			});
			const reason = buildReversalReason(event);
			expect(reason).toBe("NSF: Non-Sufficient Funds");
		});

		it("maps NSF with custom reason", () => {
			const event = makeEvent({
				event_type: "transaction.nsf",
				data: {
					amount: 100,
					transaction_id: "txn_001",
					reason: "Account frozen",
				},
			});
			const reason = buildReversalReason(event);
			expect(reason).toBe("NSF: Account frozen");
		});

		it("maps PAD return with return_code correctly", () => {
			const event = makeEvent({
				event_type: "transaction.returned",
				data: {
					amount: 100,
					transaction_id: "txn_001",
					return_code: "R01",
					reason: "Insufficient funds",
				},
			});
			const reason = buildReversalReason(event);
			expect(reason).toBe("PAD Return: R01 — Insufficient funds");
		});

		it("maps PAD return with unknown code when return_code missing", () => {
			const event = makeEvent({
				event_type: "transaction.returned",
				data: { amount: 100, transaction_id: "txn_001" },
			});
			const reason = buildReversalReason(event);
			expect(reason).toBe("PAD Return: unknown — ");
		});

		it("maps manual reversal reason", () => {
			const event = makeEvent({
				event_type: "transaction.reversed",
				data: {
					amount: 100,
					transaction_id: "txn_001",
					reason: "Duplicate payment",
				},
			});
			const reason = buildReversalReason(event);
			expect(reason).toBe("Manual Reversal: Duplicate payment");
		});

		it("maps manual reversal with empty reason", () => {
			const event = makeEvent({
				event_type: "transaction.reversed",
				data: { amount: 100, transaction_id: "txn_001" },
			});
			const reason = buildReversalReason(event);
			expect(reason).toBe("Manual Reversal: ");
		});

		it("maps unknown event type to fallback reason", () => {
			const event = makeEvent({
				event_type: "transaction.unknown",
				data: {
					amount: 100,
					transaction_id: "txn_001",
					reason: "Something else",
				},
			});
			const reason = buildReversalReason(event);
			expect(reason).toBe("Something else");
		});
	});

	// ── Reversal code mapping ────────────────────────────────────────

	describe("buildReversalCode", () => {
		it("returns NSF for transaction.nsf", () => {
			const event = makeEvent({ event_type: "transaction.nsf" });
			expect(buildReversalCode(event)).toBe("NSF");
		});

		it("returns return_code for transaction.returned", () => {
			const event = makeEvent({
				event_type: "transaction.returned",
				data: {
					amount: 100,
					transaction_id: "txn_001",
					return_code: "R03",
				},
			});
			expect(buildReversalCode(event)).toBe("R03");
		});

		it("returns undefined return_code when missing for transaction.returned", () => {
			const event = makeEvent({
				event_type: "transaction.returned",
				data: { amount: 100, transaction_id: "txn_001" },
			});
			expect(buildReversalCode(event)).toBeUndefined();
		});

		it("returns MANUAL_REVERSAL for transaction.reversed", () => {
			const event = makeEvent({ event_type: "transaction.reversed" });
			expect(buildReversalCode(event)).toBe("MANUAL_REVERSAL");
		});

		it("returns undefined for unknown event type", () => {
			const event = makeEvent({ event_type: "transaction.created" });
			expect(buildReversalCode(event)).toBeUndefined();
		});
	});
});
