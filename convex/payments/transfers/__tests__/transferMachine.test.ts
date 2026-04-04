import { describe, expect, it } from "vitest";
import { getInitialSnapshot, transition } from "xstate";
import { transferMachine } from "../../../engine/machines/transfer.machine";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Shorthand to get a snapshot at a specific state by replaying events. */
function snapshotAt(
	...events: Parameters<typeof transition>[2][]
): ReturnType<typeof getInitialSnapshot<typeof transferMachine>> {
	let snap = getInitialSnapshot(transferMachine);
	for (const event of events) {
		const [next] = transition(transferMachine, snap, event);
		snap = next;
	}
	return snap;
}

/** Standard event payloads used across tests. */
const EVENTS = {
	PROVIDER_INITIATED: {
		type: "PROVIDER_INITIATED" as const,
		providerRef: "ref-001",
	},
	PROVIDER_ACKNOWLEDGED: {
		type: "PROVIDER_ACKNOWLEDGED" as const,
		providerRef: "ref-001",
	},
	PROCESSING_UPDATE: {
		type: "PROCESSING_UPDATE" as const,
		providerData: { step: "clearing" },
	},
	FUNDS_SETTLED: {
		type: "FUNDS_SETTLED" as const,
		settledAt: 1_700_000_000_000,
		providerData: { txId: "tx-123" },
	},
	TRANSFER_FAILED: {
		type: "TRANSFER_FAILED" as const,
		errorCode: "NSF",
		reason: "Insufficient funds",
	},
	TRANSFER_REVERSED: {
		type: "TRANSFER_REVERSED" as const,
		reversalRef: "rev-001",
		reason: "Chargeback",
	},
	TRANSFER_CANCELLED: {
		type: "TRANSFER_CANCELLED" as const,
		reason: "User requested",
	},
} as const;

// ── T-001: Valid state transitions ───────────────────────────────────────

describe("Transfer machine — valid state transitions", () => {
	it("starts in initiated state", () => {
		const snap = getInitialSnapshot(transferMachine);
		expect(snap.value).toBe("initiated");
	});

	it("initiated + PROVIDER_INITIATED → pending", () => {
		const snap = getInitialSnapshot(transferMachine);
		const [next] = transition(transferMachine, snap, EVENTS.PROVIDER_INITIATED);
		expect(next.value).toBe("pending");
	});

	it("initiated + FUNDS_SETTLED → confirmed", () => {
		const snap = getInitialSnapshot(transferMachine);
		const [next] = transition(transferMachine, snap, EVENTS.FUNDS_SETTLED);
		expect(next.value).toBe("confirmed");
	});

	it("initiated + TRANSFER_CANCELLED → cancelled", () => {
		const snap = getInitialSnapshot(transferMachine);
		const [next] = transition(transferMachine, snap, EVENTS.TRANSFER_CANCELLED);
		expect(next.value).toBe("cancelled");
	});

	it("pending + PROVIDER_ACKNOWLEDGED → pending (self-loop)", () => {
		const snap = snapshotAt(EVENTS.PROVIDER_INITIATED);
		expect(snap.value).toBe("pending");

		const [next] = transition(
			transferMachine,
			snap,
			EVENTS.PROVIDER_ACKNOWLEDGED
		);
		expect(next.value).toBe("pending");
	});

	it("pending + PROCESSING_UPDATE → processing", () => {
		const snap = snapshotAt(EVENTS.PROVIDER_INITIATED);
		const [next] = transition(transferMachine, snap, EVENTS.PROCESSING_UPDATE);
		expect(next.value).toBe("processing");
	});

	it("pending + FUNDS_SETTLED → confirmed", () => {
		const snap = snapshotAt(EVENTS.PROVIDER_INITIATED);
		const [next] = transition(transferMachine, snap, EVENTS.FUNDS_SETTLED);
		expect(next.value).toBe("confirmed");
	});

	it("pending + TRANSFER_FAILED → failed", () => {
		const snap = snapshotAt(EVENTS.PROVIDER_INITIATED);
		const [next] = transition(transferMachine, snap, EVENTS.TRANSFER_FAILED);
		expect(next.value).toBe("failed");
	});

	it("processing + FUNDS_SETTLED → confirmed", () => {
		const snap = snapshotAt(
			EVENTS.PROVIDER_INITIATED,
			EVENTS.PROCESSING_UPDATE
		);
		expect(snap.value).toBe("processing");

		const [next] = transition(transferMachine, snap, EVENTS.FUNDS_SETTLED);
		expect(next.value).toBe("confirmed");
	});

	it("processing + TRANSFER_FAILED → failed", () => {
		const snap = snapshotAt(
			EVENTS.PROVIDER_INITIATED,
			EVENTS.PROCESSING_UPDATE
		);
		const [next] = transition(transferMachine, snap, EVENTS.TRANSFER_FAILED);
		expect(next.value).toBe("failed");
	});

	it("confirmed + TRANSFER_REVERSED → reversed", () => {
		const snap = snapshotAt(EVENTS.PROVIDER_INITIATED, EVENTS.FUNDS_SETTLED);
		expect(snap.value).toBe("confirmed");

		const [next] = transition(transferMachine, snap, EVENTS.TRANSFER_REVERSED);
		expect(next.value).toBe("reversed");
	});
});

// ── T-002: Invalid transitions (state should not change) ────────────────

describe("Transfer machine — invalid transitions rejected", () => {
	describe("initiated rejects", () => {
		const invalidEvents = [
			EVENTS.TRANSFER_FAILED,
			EVENTS.TRANSFER_REVERSED,
			EVENTS.PROCESSING_UPDATE,
			EVENTS.PROVIDER_ACKNOWLEDGED,
		] as const;

		for (const event of invalidEvents) {
			it(`initiated + ${event.type} → no state change`, () => {
				const snap = getInitialSnapshot(transferMachine);
				const [next] = transition(transferMachine, snap, event);
				expect(next.value).toBe("initiated");
			});
		}
	});

	describe("pending rejects", () => {
		const invalidEvents = [
			EVENTS.TRANSFER_CANCELLED,
			EVENTS.TRANSFER_REVERSED,
			EVENTS.PROVIDER_INITIATED,
		] as const;

		for (const event of invalidEvents) {
			it(`pending + ${event.type} → no state change`, () => {
				const snap = snapshotAt(EVENTS.PROVIDER_INITIATED);
				const [next] = transition(transferMachine, snap, event);
				expect(next.value).toBe("pending");
			});
		}
	});

	describe("processing rejects", () => {
		const invalidEvents = [
			EVENTS.TRANSFER_CANCELLED,
			EVENTS.TRANSFER_REVERSED,
			EVENTS.PROVIDER_INITIATED,
			EVENTS.PROVIDER_ACKNOWLEDGED,
			EVENTS.PROCESSING_UPDATE,
		] as const;

		for (const event of invalidEvents) {
			it(`processing + ${event.type} → no state change`, () => {
				const snap = snapshotAt(
					EVENTS.PROVIDER_INITIATED,
					EVENTS.PROCESSING_UPDATE
				);
				const [next] = transition(transferMachine, snap, event);
				expect(next.value).toBe("processing");
			});
		}
	});

	describe("confirmed rejects", () => {
		const invalidEvents = [
			EVENTS.FUNDS_SETTLED,
			EVENTS.TRANSFER_FAILED,
			EVENTS.TRANSFER_CANCELLED,
			EVENTS.PROVIDER_INITIATED,
		] as const;

		for (const event of invalidEvents) {
			it(`confirmed + ${event.type} → no state change`, () => {
				const snap = snapshotAt(
					EVENTS.PROVIDER_INITIATED,
					EVENTS.FUNDS_SETTLED
				);
				const [next] = transition(transferMachine, snap, event);
				expect(next.value).toBe("confirmed");
			});
		}
	});

	describe("final states reject all events", () => {
		const allEvents = [
			EVENTS.PROVIDER_INITIATED,
			EVENTS.PROVIDER_ACKNOWLEDGED,
			EVENTS.PROCESSING_UPDATE,
			EVENTS.FUNDS_SETTLED,
			EVENTS.TRANSFER_FAILED,
			EVENTS.TRANSFER_REVERSED,
			EVENTS.TRANSFER_CANCELLED,
		] as const;

		describe("failed (final)", () => {
			for (const event of allEvents) {
				it(`failed + ${event.type} → no state change`, () => {
					const snap = snapshotAt(
						EVENTS.PROVIDER_INITIATED,
						EVENTS.TRANSFER_FAILED
					);
					expect(snap.value).toBe("failed");
					const [next] = transition(transferMachine, snap, event);
					expect(next.value).toBe("failed");
				});
			}
		});

		describe("cancelled (final)", () => {
			for (const event of allEvents) {
				it(`cancelled + ${event.type} → no state change`, () => {
					const snap = snapshotAt(EVENTS.TRANSFER_CANCELLED);
					expect(snap.value).toBe("cancelled");
					const [next] = transition(transferMachine, snap, event);
					expect(next.value).toBe("cancelled");
				});
			}
		});

		describe("reversed (final)", () => {
			for (const event of allEvents) {
				it(`reversed + ${event.type} → no state change`, () => {
					const snap = snapshotAt(
						EVENTS.PROVIDER_INITIATED,
						EVENTS.FUNDS_SETTLED,
						EVENTS.TRANSFER_REVERSED
					);
					expect(snap.value).toBe("reversed");
					const [next] = transition(transferMachine, snap, event);
					expect(next.value).toBe("reversed");
				});
			}
		});
	});
});

// ── T-003: Actions fire on correct transitions ──────────────────────────

describe("Transfer machine — actions fire on correct transitions", () => {
	function actionTypes(
		...args: Parameters<typeof transition<typeof transferMachine>>
	): string[] {
		const [, actions] = transition(...args);
		return actions.map((a) => a.type);
	}

	it("initiated + PROVIDER_INITIATED fires recordTransferProviderRef", () => {
		const snap = getInitialSnapshot(transferMachine);
		expect(
			actionTypes(transferMachine, snap, EVENTS.PROVIDER_INITIATED)
		).toEqual(["recordTransferProviderRef"]);
	});

	it("initiated + FUNDS_SETTLED fires publishTransferConfirmed", () => {
		const snap = getInitialSnapshot(transferMachine);
		expect(actionTypes(transferMachine, snap, EVENTS.FUNDS_SETTLED)).toEqual([
			"publishTransferConfirmed",
		]);
	});

	it("initiated + TRANSFER_CANCELLED fires publishTransferCancelled", () => {
		const snap = getInitialSnapshot(transferMachine);
		expect(
			actionTypes(transferMachine, snap, EVENTS.TRANSFER_CANCELLED)
		).toEqual(["publishTransferCancelled"]);
	});

	it("pending + PROVIDER_ACKNOWLEDGED fires no actions (self-loop)", () => {
		const snap = snapshotAt(EVENTS.PROVIDER_INITIATED);
		expect(
			actionTypes(transferMachine, snap, EVENTS.PROVIDER_ACKNOWLEDGED)
		).toEqual([]);
	});

	it("pending + PROCESSING_UPDATE fires no actions", () => {
		const snap = snapshotAt(EVENTS.PROVIDER_INITIATED);
		expect(
			actionTypes(transferMachine, snap, EVENTS.PROCESSING_UPDATE)
		).toEqual([]);
	});

	it("pending + FUNDS_SETTLED fires publishTransferConfirmed", () => {
		const snap = snapshotAt(EVENTS.PROVIDER_INITIATED);
		expect(actionTypes(transferMachine, snap, EVENTS.FUNDS_SETTLED)).toEqual([
			"publishTransferConfirmed",
		]);
	});

	it("pending + TRANSFER_FAILED fires publishTransferFailed", () => {
		const snap = snapshotAt(EVENTS.PROVIDER_INITIATED);
		expect(actionTypes(transferMachine, snap, EVENTS.TRANSFER_FAILED)).toEqual([
			"publishTransferFailed",
		]);
	});

	it("processing + FUNDS_SETTLED fires publishTransferConfirmed", () => {
		const snap = snapshotAt(
			EVENTS.PROVIDER_INITIATED,
			EVENTS.PROCESSING_UPDATE
		);
		expect(actionTypes(transferMachine, snap, EVENTS.FUNDS_SETTLED)).toEqual([
			"publishTransferConfirmed",
		]);
	});

	it("processing + TRANSFER_FAILED fires publishTransferFailed", () => {
		const snap = snapshotAt(
			EVENTS.PROVIDER_INITIATED,
			EVENTS.PROCESSING_UPDATE
		);
		expect(actionTypes(transferMachine, snap, EVENTS.TRANSFER_FAILED)).toEqual([
			"publishTransferFailed",
		]);
	});

	it("confirmed + TRANSFER_REVERSED fires publishTransferReversed", () => {
		const snap = snapshotAt(EVENTS.PROVIDER_INITIATED, EVENTS.FUNDS_SETTLED);
		expect(
			actionTypes(transferMachine, snap, EVENTS.TRANSFER_REVERSED)
		).toEqual(["publishTransferReversed"]);
	});

	it("invalid transitions fire no actions", () => {
		const snap = getInitialSnapshot(transferMachine);
		// initiated + TRANSFER_FAILED is invalid
		expect(actionTypes(transferMachine, snap, EVENTS.TRANSFER_FAILED)).toEqual(
			[]
		);
	});
});
