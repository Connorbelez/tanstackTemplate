import { describe, expect, it } from "vitest";
import type { StripeWebhookEvent } from "../stripe";
import {
	buildReversalCode,
	buildReversalReason,
	extractProviderRef,
	REVERSAL_EVENT_TYPES,
	toPayload,
} from "../stripe";

// ── Helpers ──────────────────────────────────────────────────────────

function makeEvent(
	overrides: Partial<StripeWebhookEvent> & { type: string }
): StripeWebhookEvent {
	return {
		id: overrides.id ?? "evt_test_001",
		type: overrides.type,
		created: overrides.created ?? 1_711_929_600, // 2024-04-01 00:00:00 UTC
		data: overrides.data ?? {
			object: {
				id: "ch_test_001",
				amount: 5000,
			},
		},
	};
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Stripe webhook handler", () => {
	// ── Event filtering ──────────────────────────────────────────────

	describe("event type filtering", () => {
		it("recognizes charge.refunded as a reversal event", () => {
			expect(REVERSAL_EVENT_TYPES.has("charge.refunded")).toBe(true);
		});

		it("recognizes charge.dispute.created as a reversal event", () => {
			expect(REVERSAL_EVENT_TYPES.has("charge.dispute.created")).toBe(true);
		});

		it("recognizes payment_intent.payment_failed as a reversal event", () => {
			expect(REVERSAL_EVENT_TYPES.has("payment_intent.payment_failed")).toBe(
				true
			);
		});

		it("does not recognize charge.succeeded as a reversal event", () => {
			expect(REVERSAL_EVENT_TYPES.has("charge.succeeded")).toBe(false);
		});

		it("does not recognize payment_intent.succeeded as a reversal event", () => {
			expect(REVERSAL_EVENT_TYPES.has("payment_intent.succeeded")).toBe(false);
		});

		it("contains exactly 3 event types", () => {
			expect(REVERSAL_EVENT_TYPES.size).toBe(3);
		});
	});

	// ── Provider ref extraction ──────────────────────────────────────

	describe("extractProviderRef", () => {
		it("extracts providerRef from metadata.provider_ref for charge.refunded", () => {
			const event = makeEvent({
				type: "charge.refunded",
				data: {
					object: {
						id: "ch_abc",
						amount: 5000,
						metadata: { provider_ref: "ref_from_metadata" },
					},
				},
			});
			expect(extractProviderRef(event)).toBe("ref_from_metadata");
		});

		it("extracts providerRef from metadata.providerRef (camelCase) for charge.refunded", () => {
			const event = makeEvent({
				type: "charge.refunded",
				data: {
					object: {
						id: "ch_abc",
						amount: 5000,
						metadata: { providerRef: "ref_camel_case" },
					},
				},
			});
			expect(extractProviderRef(event)).toBe("ref_camel_case");
		});

		it("falls back to object ID when metadata missing for charge.refunded", () => {
			const event = makeEvent({
				type: "charge.refunded",
				data: {
					object: {
						id: "ch_fallback",
						amount: 5000,
					},
				},
			});
			expect(extractProviderRef(event)).toBe("ch_fallback");
		});

		it("falls back to object ID when metadata has no provider_ref", () => {
			const event = makeEvent({
				type: "charge.refunded",
				data: {
					object: {
						id: "ch_no_ref",
						amount: 5000,
						metadata: { other_key: "other_value" },
					},
				},
			});
			expect(extractProviderRef(event)).toBe("ch_no_ref");
		});

		it("uses charge field for dispute providerRef", () => {
			const event = makeEvent({
				type: "charge.dispute.created",
				data: {
					object: {
						id: "dp_001",
						amount: 3000,
						charge: "ch_disputed_charge",
					},
				},
			});
			expect(extractProviderRef(event)).toBe("ch_disputed_charge");
		});

		it("falls back to dispute object ID when charge missing", () => {
			const event = makeEvent({
				type: "charge.dispute.created",
				data: {
					object: {
						id: "dp_002",
						amount: 3000,
					},
				},
			});
			expect(extractProviderRef(event)).toBe("dp_002");
		});

		it("uses object ID for payment_intent.payment_failed", () => {
			const event = makeEvent({
				type: "payment_intent.payment_failed",
				data: {
					object: {
						id: "pi_failed_001",
						amount: 7500,
					},
				},
			});
			expect(extractProviderRef(event)).toBe("pi_failed_001");
		});

		it("uses object ID for unknown event types", () => {
			const event = makeEvent({
				type: "some.unknown.event",
				data: {
					object: {
						id: "obj_unknown",
						amount: 1000,
					},
				},
			});
			expect(extractProviderRef(event)).toBe("obj_unknown");
		});
	});

	// ── Payload mapping ──────────────────────────────────────────────

	describe("toPayload", () => {
		it("converts Stripe timestamp to YYYY-MM-DD date", () => {
			// 1711929600 = 2024-04-01T00:00:00Z
			const event = makeEvent({
				type: "charge.refunded",
				created: 1_711_929_600,
			});
			const payload = toPayload(event);
			expect(payload.reversalDate).toBe("2024-04-01");
		});

		it("sets provider to stripe", () => {
			const event = makeEvent({ type: "charge.refunded" });
			const payload = toPayload(event);
			expect(payload.provider).toBe("stripe");
		});

		it("uses event.id as providerEventId", () => {
			const event = makeEvent({
				type: "charge.refunded",
				id: "evt_unique_123",
			});
			const payload = toPayload(event);
			expect(payload.providerEventId).toBe("evt_unique_123");
		});

		it("passes amount directly (Stripe already uses cents)", () => {
			const event = makeEvent({
				type: "charge.refunded",
				data: {
					object: {
						id: "ch_001",
						amount: 15_075,
					},
				},
			});
			const payload = toPayload(event);
			expect(payload.originalAmount).toBe(15_075);
		});
	});

	// ── Reversal reason ──────────────────────────────────────────────

	describe("buildReversalReason", () => {
		it("formats ACH Return reason for charge.refunded", () => {
			const event = makeEvent({
				type: "charge.refunded",
				data: {
					object: {
						id: "ch_001",
						amount: 5000,
						reason: "fraudulent",
					},
				},
			});
			expect(buildReversalReason(event)).toBe("ACH Return: fraudulent");
		});

		it("falls back to status for charge.refunded when no reason", () => {
			const event = makeEvent({
				type: "charge.refunded",
				data: {
					object: {
						id: "ch_001",
						amount: 5000,
						status: "refunded",
					},
				},
			});
			expect(buildReversalReason(event)).toBe("ACH Return: refunded");
		});

		it("defaults to 'refunded' when no reason or status for charge.refunded", () => {
			const event = makeEvent({
				type: "charge.refunded",
				data: {
					object: {
						id: "ch_001",
						amount: 5000,
					},
				},
			});
			expect(buildReversalReason(event)).toBe("ACH Return: refunded");
		});

		it("formats dispute reason", () => {
			const event = makeEvent({
				type: "charge.dispute.created",
				data: {
					object: {
						id: "dp_001",
						amount: 3000,
						reason: "product_not_received",
					},
				},
			});
			expect(buildReversalReason(event)).toBe("Dispute: product_not_received");
		});

		it("defaults to 'opened' for dispute when no reason", () => {
			const event = makeEvent({
				type: "charge.dispute.created",
				data: {
					object: {
						id: "dp_001",
						amount: 3000,
					},
				},
			});
			expect(buildReversalReason(event)).toBe("Dispute: opened");
		});

		it("formats ACH Failure with failure_code and failure_message", () => {
			const event = makeEvent({
				type: "payment_intent.payment_failed",
				data: {
					object: {
						id: "pi_001",
						amount: 7500,
						failure_code: "insufficient_funds",
						failure_message: "The account has insufficient funds.",
					},
				},
			});
			expect(buildReversalReason(event)).toBe(
				"ACH Failure: insufficient_funds — The account has insufficient funds."
			);
		});

		it("defaults to 'unknown' for failed payment when no failure_code", () => {
			const event = makeEvent({
				type: "payment_intent.payment_failed",
				data: {
					object: {
						id: "pi_001",
						amount: 7500,
					},
				},
			});
			expect(buildReversalReason(event)).toBe("ACH Failure: unknown — ");
		});

		it("returns 'Unknown reversal' for unrecognized event types", () => {
			const event = makeEvent({
				type: "some.other.event",
			});
			expect(buildReversalReason(event)).toBe("Unknown reversal");
		});
	});

	// ── Reversal code ────────────────────────────────────────────────

	describe("buildReversalCode", () => {
		it("sets reversalCode to reason for charge.refunded", () => {
			const event = makeEvent({
				type: "charge.refunded",
				data: {
					object: {
						id: "ch_001",
						amount: 5000,
						reason: "fraudulent",
					},
				},
			});
			expect(buildReversalCode(event)).toBe("fraudulent");
		});

		it("defaults to REFUND when no reason for charge.refunded", () => {
			const event = makeEvent({
				type: "charge.refunded",
				data: {
					object: {
						id: "ch_001",
						amount: 5000,
					},
				},
			});
			expect(buildReversalCode(event)).toBe("REFUND");
		});

		it("sets reversalCode to DISPUTE for dispute events", () => {
			const event = makeEvent({
				type: "charge.dispute.created",
				data: {
					object: {
						id: "dp_001",
						amount: 3000,
					},
				},
			});
			expect(buildReversalCode(event)).toBe("DISPUTE");
		});

		it("maps failure_code for failed payments", () => {
			const event = makeEvent({
				type: "payment_intent.payment_failed",
				data: {
					object: {
						id: "pi_001",
						amount: 7500,
						failure_code: "insufficient_funds",
					},
				},
			});
			expect(buildReversalCode(event)).toBe("insufficient_funds");
		});

		it("returns undefined failure_code when missing for failed payments", () => {
			const event = makeEvent({
				type: "payment_intent.payment_failed",
				data: {
					object: {
						id: "pi_001",
						amount: 7500,
					},
				},
			});
			expect(buildReversalCode(event)).toBeUndefined();
		});

		it("returns undefined for unknown event types", () => {
			const event = makeEvent({
				type: "charge.succeeded",
			});
			expect(buildReversalCode(event)).toBeUndefined();
		});
	});
});
