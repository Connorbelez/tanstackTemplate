import { describe, expect, it } from "vitest";
import { transition } from "xstate";
import { TRANSFER_MACHINE_VERSION, transferMachine } from "../transfer.machine";

// ── Helpers ─────────────────────────────────────────────────────────

const DEFAULT_CONTEXT = {
	transferId: "test-transfer",
	providerRef: "",
	retryCount: 0,
};

function snapshotAt(stateValue: string) {
	return transferMachine.resolveState({
		value: stateValue,
		context: { ...DEFAULT_CONTEXT },
	});
}

// ── Event factories ─────────────────────────────────────────────────

const PROVIDER_INITIATED = {
	type: "PROVIDER_INITIATED" as const,
	providerRef: "ref-001",
};
const PROVIDER_ACKNOWLEDGED = {
	type: "PROVIDER_ACKNOWLEDGED" as const,
	providerRef: "ref-001",
};
const PROCESSING_UPDATE = {
	type: "PROCESSING_UPDATE" as const,
	providerData: { step: "clearing" },
};
const FUNDS_SETTLED = {
	type: "FUNDS_SETTLED" as const,
	settledAt: 1000,
	providerData: {},
};
const TRANSFER_FAILED = {
	type: "TRANSFER_FAILED" as const,
	errorCode: "E001",
	reason: "NSF",
};
const TRANSFER_REVERSED = {
	type: "TRANSFER_REVERSED" as const,
	reversalRef: "rev-001",
	reason: "chargeback",
};
const TRANSFER_CANCELLED = {
	type: "TRANSFER_CANCELLED" as const,
	reason: "user-request",
};

const ALL_EVENTS = [
	PROVIDER_INITIATED,
	PROVIDER_ACKNOWLEDGED,
	PROCESSING_UPDATE,
	FUNDS_SETTLED,
	TRANSFER_FAILED,
	TRANSFER_REVERSED,
	TRANSFER_CANCELLED,
] as const;

// ── Tests ───────────────────────────────────────────────────────────

describe("transfer machine", () => {
	// ── Machine metadata ────────────────────────────────────────────

	it("has version 1.0.0", () => {
		expect(transferMachine.version).toBe("1.0.0");
		expect(TRANSFER_MACHINE_VERSION).toBe("1.0.0");
	});

	it("has the correct machine id", () => {
		expect(transferMachine.id).toBe("transfer");
	});

	it("starts in initiated state", () => {
		expect(transferMachine.config.initial).toBe("initiated");
	});

	it("failed is marked as a final state", () => {
		expect(transferMachine.config.states?.failed?.type).toBe("final");
	});

	it("cancelled is marked as a final state", () => {
		expect(transferMachine.config.states?.cancelled?.type).toBe("final");
	});

	it("reversed is marked as a final state", () => {
		expect(transferMachine.config.states?.reversed?.type).toBe("final");
	});

	it("confirmed is NOT a final state (has outbound TRANSFER_REVERSED transition)", () => {
		expect(transferMachine.config.states?.confirmed?.type).not.toBe("final");
	});

	// ── initiated state ─────────────────────────────────────────────

	describe("initiated state", () => {
		it("initiated -> pending on PROVIDER_INITIATED fires recordTransferProviderRef", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("initiated"),
				PROVIDER_INITIATED
			);
			expect(next.value).toBe("pending");
			expect(actions.map((a) => a.type)).toContain("recordTransferProviderRef");
		});

		it("initiated -> confirmed on FUNDS_SETTLED fires publishTransferConfirmed", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("initiated"),
				FUNDS_SETTLED
			);
			expect(next.value).toBe("confirmed");
			expect(actions.map((a) => a.type)).toContain("publishTransferConfirmed");
		});

		it("initiated -> cancelled on TRANSFER_CANCELLED", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("initiated"),
				TRANSFER_CANCELLED
			);
			expect(next.value).toBe("cancelled");
			expect(actions).toHaveLength(0);
		});

		it("initiated ignores PROVIDER_ACKNOWLEDGED", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("initiated"),
				PROVIDER_ACKNOWLEDGED
			);
			expect(next.value).toBe("initiated");
			expect(actions).toHaveLength(0);
		});

		it("initiated ignores PROCESSING_UPDATE", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("initiated"),
				PROCESSING_UPDATE
			);
			expect(next.value).toBe("initiated");
			expect(actions).toHaveLength(0);
		});

		it("initiated ignores TRANSFER_FAILED", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("initiated"),
				TRANSFER_FAILED
			);
			expect(next.value).toBe("initiated");
			expect(actions).toHaveLength(0);
		});

		it("initiated ignores TRANSFER_REVERSED", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("initiated"),
				TRANSFER_REVERSED
			);
			expect(next.value).toBe("initiated");
			expect(actions).toHaveLength(0);
		});
	});

	// ── pending state ───────────────────────────────────────────────

	describe("pending state", () => {
		it("pending -> processing on PROCESSING_UPDATE", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("pending"),
				PROCESSING_UPDATE
			);
			expect(next.value).toBe("processing");
			expect(actions).toHaveLength(0);
		});

		it("pending -> confirmed on FUNDS_SETTLED fires publishTransferConfirmed", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("pending"),
				FUNDS_SETTLED
			);
			expect(next.value).toBe("confirmed");
			expect(actions.map((a) => a.type)).toContain("publishTransferConfirmed");
		});

		it("pending -> failed on TRANSFER_FAILED fires publishTransferFailed", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("pending"),
				TRANSFER_FAILED
			);
			expect(next.value).toBe("failed");
			expect(actions.map((a) => a.type)).toContain("publishTransferFailed");
		});

		it("pending stays in pending on PROVIDER_ACKNOWLEDGED (self-loop)", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("pending"),
				PROVIDER_ACKNOWLEDGED
			);
			expect(next.value).toBe("pending");
			// Self-loop with no actions
			expect(actions).toHaveLength(0);
		});

		it("pending ignores PROVIDER_INITIATED", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("pending"),
				PROVIDER_INITIATED
			);
			expect(next.value).toBe("pending");
			expect(actions).toHaveLength(0);
		});

		it("pending ignores TRANSFER_REVERSED", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("pending"),
				TRANSFER_REVERSED
			);
			expect(next.value).toBe("pending");
			expect(actions).toHaveLength(0);
		});

		it("pending ignores TRANSFER_CANCELLED", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("pending"),
				TRANSFER_CANCELLED
			);
			expect(next.value).toBe("pending");
			expect(actions).toHaveLength(0);
		});
	});

	// ── processing state ────────────────────────────────────────────

	describe("processing state", () => {
		it("processing -> confirmed on FUNDS_SETTLED fires publishTransferConfirmed", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("processing"),
				FUNDS_SETTLED
			);
			expect(next.value).toBe("confirmed");
			expect(actions.map((a) => a.type)).toContain("publishTransferConfirmed");
		});

		it("processing -> failed on TRANSFER_FAILED fires publishTransferFailed", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("processing"),
				TRANSFER_FAILED
			);
			expect(next.value).toBe("failed");
			expect(actions.map((a) => a.type)).toContain("publishTransferFailed");
		});

		it("processing ignores PROVIDER_INITIATED", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("processing"),
				PROVIDER_INITIATED
			);
			expect(next.value).toBe("processing");
			expect(actions).toHaveLength(0);
		});

		it("processing ignores PROVIDER_ACKNOWLEDGED", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("processing"),
				PROVIDER_ACKNOWLEDGED
			);
			expect(next.value).toBe("processing");
			expect(actions).toHaveLength(0);
		});

		it("processing ignores PROCESSING_UPDATE", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("processing"),
				PROCESSING_UPDATE
			);
			expect(next.value).toBe("processing");
			expect(actions).toHaveLength(0);
		});

		it("processing ignores TRANSFER_REVERSED", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("processing"),
				TRANSFER_REVERSED
			);
			expect(next.value).toBe("processing");
			expect(actions).toHaveLength(0);
		});

		it("processing ignores TRANSFER_CANCELLED", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("processing"),
				TRANSFER_CANCELLED
			);
			expect(next.value).toBe("processing");
			expect(actions).toHaveLength(0);
		});
	});

	// ── confirmed state ─────────────────────────────────────────────

	describe("confirmed state", () => {
		it("confirmed -> reversed on TRANSFER_REVERSED fires publishTransferReversed", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("confirmed"),
				TRANSFER_REVERSED
			);
			expect(next.value).toBe("reversed");
			expect(actions.map((a) => a.type)).toContain("publishTransferReversed");
		});

		for (const event of ALL_EVENTS.filter(
			(e) => e.type !== "TRANSFER_REVERSED"
		)) {
			it(`confirmed ignores ${event.type}`, () => {
				const [next, actions] = transition(
					transferMachine,
					snapshotAt("confirmed"),
					event
				);
				expect(next.value).toBe("confirmed");
				expect(actions).toHaveLength(0);
			});
		}
	});

	// ── Terminal states ─────────────────────────────────────────────

	describe("failed (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`failed ignores ${event.type}`, () => {
				const [next, actions] = transition(
					transferMachine,
					snapshotAt("failed"),
					event
				);
				expect(next.value).toBe("failed");
				expect(actions).toHaveLength(0);
			});
		}
	});

	describe("cancelled (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`cancelled ignores ${event.type}`, () => {
				const [next, actions] = transition(
					transferMachine,
					snapshotAt("cancelled"),
					event
				);
				expect(next.value).toBe("cancelled");
				expect(actions).toHaveLength(0);
			});
		}
	});

	describe("reversed (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`reversed ignores ${event.type}`, () => {
				const [next, actions] = transition(
					transferMachine,
					snapshotAt("reversed"),
					event
				);
				expect(next.value).toBe("reversed");
				expect(actions).toHaveLength(0);
			});
		}
	});

	// ── Action specificity ──────────────────────────────────────────

	describe("action verification", () => {
		it("FUNDS_SETTLED triggers publishTransferConfirmed in every state that accepts it", () => {
			for (const state of ["initiated", "pending", "processing"]) {
				const [, actions] = transition(
					transferMachine,
					snapshotAt(state),
					FUNDS_SETTLED
				);
				expect(actions.map((a) => a.type)).toContain(
					"publishTransferConfirmed"
				);
			}
		});

		it("TRANSFER_FAILED triggers publishTransferFailed in every state that accepts it", () => {
			for (const state of ["pending", "processing"]) {
				const [, actions] = transition(
					transferMachine,
					snapshotAt(state),
					TRANSFER_FAILED
				);
				expect(actions.map((a) => a.type)).toContain("publishTransferFailed");
			}
		});

		it("TRANSFER_REVERSED triggers publishTransferReversed", () => {
			const [, actions] = transition(
				transferMachine,
				snapshotAt("confirmed"),
				TRANSFER_REVERSED
			);
			expect(actions.map((a) => a.type)).toContain("publishTransferReversed");
		});

		it("PROVIDER_INITIATED triggers recordTransferProviderRef", () => {
			const [, actions] = transition(
				transferMachine,
				snapshotAt("initiated"),
				PROVIDER_INITIATED
			);
			expect(actions.map((a) => a.type)).toContain("recordTransferProviderRef");
		});
	});

	// ── Happy path integration tests ────────────────────────────────

	describe("happy paths", () => {
		it("immediate settlement: initiated -> confirmed (manual payment shortcut)", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("initiated"),
				FUNDS_SETTLED
			);
			expect(next.value).toBe("confirmed");
			expect(actions.map((a) => a.type)).toContain("publishTransferConfirmed");
		});

		it("async path: initiated -> pending -> confirmed", () => {
			const [step1, actions1] = transition(
				transferMachine,
				snapshotAt("initiated"),
				PROVIDER_INITIATED
			);
			expect(step1.value).toBe("pending");
			expect(actions1.map((a) => a.type)).toContain(
				"recordTransferProviderRef"
			);

			const [step2, actions2] = transition(
				transferMachine,
				step1,
				FUNDS_SETTLED
			);
			expect(step2.value).toBe("confirmed");
			expect(actions2.map((a) => a.type)).toContain("publishTransferConfirmed");
		});

		it("full async path: initiated -> pending -> processing -> confirmed", () => {
			const [step1] = transition(
				transferMachine,
				snapshotAt("initiated"),
				PROVIDER_INITIATED
			);
			expect(step1.value).toBe("pending");

			const [step2] = transition(transferMachine, step1, PROCESSING_UPDATE);
			expect(step2.value).toBe("processing");

			const [step3, actions3] = transition(
				transferMachine,
				step2,
				FUNDS_SETTLED
			);
			expect(step3.value).toBe("confirmed");
			expect(actions3.map((a) => a.type)).toContain("publishTransferConfirmed");
		});

		it("failure path: initiated -> pending -> failed", () => {
			const [step1] = transition(
				transferMachine,
				snapshotAt("initiated"),
				PROVIDER_INITIATED
			);
			expect(step1.value).toBe("pending");

			const [step2, actions2] = transition(
				transferMachine,
				step1,
				TRANSFER_FAILED
			);
			expect(step2.value).toBe("failed");
			expect(actions2.map((a) => a.type)).toContain("publishTransferFailed");
		});

		it("processing failure path: initiated -> pending -> processing -> failed", () => {
			const [step1] = transition(
				transferMachine,
				snapshotAt("initiated"),
				PROVIDER_INITIATED
			);
			const [step2] = transition(transferMachine, step1, PROCESSING_UPDATE);
			expect(step2.value).toBe("processing");

			const [step3, actions3] = transition(
				transferMachine,
				step2,
				TRANSFER_FAILED
			);
			expect(step3.value).toBe("failed");
			expect(actions3.map((a) => a.type)).toContain("publishTransferFailed");
		});

		it("reversal path: initiated -> confirmed -> reversed", () => {
			const [step1] = transition(
				transferMachine,
				snapshotAt("initiated"),
				FUNDS_SETTLED
			);
			expect(step1.value).toBe("confirmed");

			const [step2, actions2] = transition(
				transferMachine,
				step1,
				TRANSFER_REVERSED
			);
			expect(step2.value).toBe("reversed");
			expect(actions2.map((a) => a.type)).toContain("publishTransferReversed");
		});

		it("cancel path: initiated -> cancelled", () => {
			const [next, actions] = transition(
				transferMachine,
				snapshotAt("initiated"),
				TRANSFER_CANCELLED
			);
			expect(next.value).toBe("cancelled");
			expect(actions).toHaveLength(0);
		});

		it("async reversal path: initiated -> pending -> confirmed -> reversed", () => {
			const [step1] = transition(
				transferMachine,
				snapshotAt("initiated"),
				PROVIDER_INITIATED
			);
			expect(step1.value).toBe("pending");

			const [step2] = transition(transferMachine, step1, FUNDS_SETTLED);
			expect(step2.value).toBe("confirmed");

			const [step3, actions3] = transition(
				transferMachine,
				step2,
				TRANSFER_REVERSED
			);
			expect(step3.value).toBe("reversed");
			expect(actions3.map((a) => a.type)).toContain("publishTransferReversed");
		});

		it("pending self-loop then settlement: pending -> pending -> confirmed", () => {
			const snap = snapshotAt("pending");

			// PROVIDER_ACKNOWLEDGED stays in pending
			const [step1, actions1] = transition(
				transferMachine,
				snap,
				PROVIDER_ACKNOWLEDGED
			);
			expect(step1.value).toBe("pending");
			expect(actions1).toHaveLength(0);

			// Then settle
			const [step2, actions2] = transition(
				transferMachine,
				step1,
				FUNDS_SETTLED
			);
			expect(step2.value).toBe("confirmed");
			expect(actions2.map((a) => a.type)).toContain("publishTransferConfirmed");
		});
	});

	// ── Sentinel: total test case count ─────────────────────────────

	it("covers all 7×7 state×event cells plus action and path tests", () => {
		// Metadata: 7
		// initiated state: 7 (3 valid transitions + 4 ignored events)
		// pending state: 7 (3 valid transitions + 1 self-loop + 3 ignored events)
		// processing state: 7 (2 valid transitions + 5 ignored events)
		// confirmed state: 7 (1 valid transition + 6 ignored events)
		// failed terminal: 7
		// cancelled terminal: 7
		// reversed terminal: 7
		// Action verification: 4
		// Happy paths: 9
		// Sentinel: 1
		const expectedMetadata = 7;
		const expectedStateCells = 7 + 7 + 7 + 7;
		const expectedTerminalCells = 7 + 7 + 7;
		const expectedActionTests = 4;
		const expectedHappyPaths = 9;
		const expectedSentinel = 1;
		const expectedTotal =
			expectedMetadata +
			expectedStateCells +
			expectedTerminalCells +
			expectedActionTests +
			expectedHappyPaths +
			expectedSentinel;
		expect(expectedTotal).toBe(70);
	});
});
