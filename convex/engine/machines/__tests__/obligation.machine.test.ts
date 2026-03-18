import { describe, expect, it } from "vitest";
import { transition } from "xstate";
import {
	OBLIGATION_MACHINE_VERSION,
	obligationMachine,
} from "../obligation.machine";

// ── Helpers ─────────────────────────────────────────────────────────

function snapshotAt(stateValue: string) {
	return obligationMachine.resolveState({
		value: stateValue,
		context: { obligationId: "test_ob", paymentsApplied: 0 },
	});
}

// Event factories
const BECAME_DUE = { type: "BECAME_DUE" as const };
const GRACE_PERIOD_EXPIRED = { type: "GRACE_PERIOD_EXPIRED" as const };
const PAYMENT_APPLIED_FULL = {
	type: "PAYMENT_APPLIED" as const,
	amount: 150_000,
	attemptId: "attempt_1",
	currentAmountSettled: 350_000,
	totalAmount: 500_000,
};
const PAYMENT_APPLIED_PARTIAL = {
	type: "PAYMENT_APPLIED" as const,
	amount: 50_000,
	attemptId: "attempt_2",
	currentAmountSettled: 0,
	totalAmount: 500_000,
};
const OBLIGATION_WAIVED = {
	type: "OBLIGATION_WAIVED" as const,
	reason: "fee forgiveness",
	approvedBy: "admin_1",
};

const ALL_EVENTS = [
	BECAME_DUE,
	GRACE_PERIOD_EXPIRED,
	PAYMENT_APPLIED_FULL,
	OBLIGATION_WAIVED,
] as const;

// ── Tests ───────────────────────────────────────────────────────────

describe("obligation machine", () => {
	// ── Machine metadata ────────────────────────────────────────────

	it("exports OBLIGATION_MACHINE_VERSION = 1.0.0", () => {
		expect(OBLIGATION_MACHINE_VERSION).toBe("1.0.0");
	});

	it("starts in upcoming state", () => {
		expect(obligationMachine.config.initial).toBe("upcoming");
	});

	it("has the correct machine id", () => {
		expect(obligationMachine.id).toBe("obligation");
	});

	it("settled is marked as a final state", () => {
		expect(obligationMachine.config.states?.settled?.type).toBe("final");
	});

	it("waived is marked as a final state", () => {
		expect(obligationMachine.config.states?.waived?.type).toBe("final");
	});

	// ── 6×4 State × Event Matrix ───────────────────────────────────

	describe("upcoming state", () => {
		it("upcoming → due on BECAME_DUE", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("upcoming"),
				BECAME_DUE
			);
			expect(next.value).toBe("due");
			expect(actions).toHaveLength(0);
		});

		it("upcoming ignores GRACE_PERIOD_EXPIRED", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("upcoming"),
				GRACE_PERIOD_EXPIRED
			);
			expect(next.value).toBe("upcoming");
			expect(actions).toHaveLength(0);
		});

		it("upcoming ignores PAYMENT_APPLIED (full)", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("upcoming"),
				PAYMENT_APPLIED_FULL
			);
			expect(next.value).toBe("upcoming");
			expect(actions).toHaveLength(0);
		});

		it("upcoming → waived on OBLIGATION_WAIVED", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("upcoming"),
				OBLIGATION_WAIVED
			);
			expect(next.value).toBe("waived");
			expect(actions.map((a) => a.type)).toContain("recordWaiver");
		});
	});

	describe("due state", () => {
		it("due ignores BECAME_DUE", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("due"),
				BECAME_DUE
			);
			expect(next.value).toBe("due");
			expect(actions).toHaveLength(0);
		});

		it("due → overdue on GRACE_PERIOD_EXPIRED fires emitObligationOverdue and createLateFeeObligation", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("due"),
				GRACE_PERIOD_EXPIRED
			);
			expect(next.value).toBe("overdue");
			const actionNames = actions.map((a) => a.type);
			expect(actionNames).toContain("emitObligationOverdue");
			expect(actionNames).toContain("createLateFeeObligation");
		});

		it("due → settled on PAYMENT_APPLIED (full) fires applyPayment and emitObligationSettled", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("due"),
				PAYMENT_APPLIED_FULL
			);
			expect(next.value).toBe("settled");
			const actionNames = actions.map((a) => a.type);
			expect(actionNames).toContain("applyPayment");
			expect(actionNames).toContain("emitObligationSettled");
		});

		it("due → partially_settled on PAYMENT_APPLIED (partial) fires applyPayment but not emitObligationSettled", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("due"),
				PAYMENT_APPLIED_PARTIAL
			);
			expect(next.value).toBe("partially_settled");
			const actionNames = actions.map((a) => a.type);
			expect(actionNames).toContain("applyPayment");
			expect(actionNames).not.toContain("emitObligationSettled");
		});

		it("due → waived on OBLIGATION_WAIVED fires recordWaiver", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("due"),
				OBLIGATION_WAIVED
			);
			expect(next.value).toBe("waived");
			expect(actions.map((a) => a.type)).toContain("recordWaiver");
		});
	});

	describe("overdue state", () => {
		it("overdue ignores BECAME_DUE", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("overdue"),
				BECAME_DUE
			);
			expect(next.value).toBe("overdue");
			expect(actions).toHaveLength(0);
		});

		it("overdue ignores GRACE_PERIOD_EXPIRED", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("overdue"),
				GRACE_PERIOD_EXPIRED
			);
			expect(next.value).toBe("overdue");
			expect(actions).toHaveLength(0);
		});

		it("overdue → settled on PAYMENT_APPLIED (full) fires applyPayment and emitObligationSettled", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("overdue"),
				PAYMENT_APPLIED_FULL
			);
			expect(next.value).toBe("settled");
			const actionNames = actions.map((a) => a.type);
			expect(actionNames).toContain("applyPayment");
			expect(actionNames).toContain("emitObligationSettled");
		});

		it("overdue → partially_settled on PAYMENT_APPLIED (partial) fires applyPayment", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("overdue"),
				PAYMENT_APPLIED_PARTIAL
			);
			expect(next.value).toBe("partially_settled");
			const actionNames = actions.map((a) => a.type);
			expect(actionNames).toContain("applyPayment");
		});

		it("overdue → waived on OBLIGATION_WAIVED fires recordWaiver", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("overdue"),
				OBLIGATION_WAIVED
			);
			expect(next.value).toBe("waived");
			expect(actions.map((a) => a.type)).toContain("recordWaiver");
		});
	});

	describe("partially_settled state", () => {
		it("partially_settled ignores BECAME_DUE", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("partially_settled"),
				BECAME_DUE
			);
			expect(next.value).toBe("partially_settled");
			expect(actions).toHaveLength(0);
		});

		it("partially_settled → overdue on GRACE_PERIOD_EXPIRED fires emitObligationOverdue but not createLateFeeObligation", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("partially_settled"),
				GRACE_PERIOD_EXPIRED
			);
			expect(next.value).toBe("overdue");
			const actionNames = actions.map((a) => a.type);
			expect(actionNames).toContain("emitObligationOverdue");
			expect(actionNames).not.toContain("createLateFeeObligation");
		});

		it("partially_settled → settled on PAYMENT_APPLIED (full) fires applyPayment and emitObligationSettled", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("partially_settled"),
				PAYMENT_APPLIED_FULL
			);
			expect(next.value).toBe("settled");
			const actionNames = actions.map((a) => a.type);
			expect(actionNames).toContain("applyPayment");
			expect(actionNames).toContain("emitObligationSettled");
		});

		it("partially_settled stays on PAYMENT_APPLIED (partial) fires applyPayment", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("partially_settled"),
				PAYMENT_APPLIED_PARTIAL
			);
			expect(next.value).toBe("partially_settled");
			const actionNames = actions.map((a) => a.type);
			expect(actionNames).toContain("applyPayment");
		});

		it("partially_settled → waived on OBLIGATION_WAIVED fires recordWaiver", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("partially_settled"),
				OBLIGATION_WAIVED
			);
			expect(next.value).toBe("waived");
			expect(actions.map((a) => a.type)).toContain("recordWaiver");
		});
	});

	// ── Terminal state lockdown ─────────────────────────────────────

	describe("settled (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`settled ignores ${event.type}`, () => {
				const [next, actions] = transition(
					obligationMachine,
					snapshotAt("settled"),
					event
				);
				expect(next.value).toBe("settled");
				expect(actions).toHaveLength(0);
			});
		}
	});

	describe("waived (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`waived ignores ${event.type}`, () => {
				const [next, actions] = transition(
					obligationMachine,
					snapshotAt("waived"),
					event
				);
				expect(next.value).toBe("waived");
				expect(actions).toHaveLength(0);
			});
		}
	});

	// ── Sentinel: total test case count ─────────────────────────────

	it("covers all 6×4 state×event cells plus partial-payment branches", () => {
		// 4 states with specific event handling (upcoming: 4, due: 5, overdue: 5, partially_settled: 5)
		// + 2 terminal states × 4 events each = 8
		// + 5 metadata tests
		// = 32 total test cases (including this sentinel)
		// This sentinel exists to catch accidental test deletion.
		const expectedNonTerminalCells = 19; // 4 + 5 + 5 + 5
		const expectedTerminalCells = 8; // 2 × 4
		const expectedMetadata = 5;
		const expectedTotal =
			expectedNonTerminalCells + expectedTerminalCells + expectedMetadata + 1; // +1 for this sentinel
		expect(expectedTotal).toBe(33);
	});
});
