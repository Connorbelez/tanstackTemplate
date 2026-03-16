import { describe, expect, it } from "vitest";
import { transition } from "xstate";
import { obligationMachine } from "../obligation.machine";

// ── Helpers ─────────────────────────────────────────────────────────

function snapshotAt(stateValue: string) {
	return obligationMachine.resolveState({
		value: stateValue,
		context: {} as Record<string, never>,
	});
}

// Event factories
const DUE_DATE_REACHED = { type: "DUE_DATE_REACHED" as const };
const GRACE_PERIOD_EXPIRED = { type: "GRACE_PERIOD_EXPIRED" as const };
const PAYMENT_APPLIED = {
	type: "PAYMENT_APPLIED" as const,
	amount: 150_000,
	paidAt: 1000,
};

const ALL_EVENTS = [
	DUE_DATE_REACHED,
	GRACE_PERIOD_EXPIRED,
	PAYMENT_APPLIED,
] as const;

// ── Tests ───────────────────────────────────────────────────────────

describe("obligation machine", () => {
	// ── Machine metadata ────────────────────────────────────────────

	it("starts in upcoming state", () => {
		expect(obligationMachine.config.initial).toBe("upcoming");
	});

	it("has the correct machine id", () => {
		expect(obligationMachine.id).toBe("obligation");
	});

	it("settled is marked as a final state", () => {
		expect(obligationMachine.config.states?.settled?.type).toBe("final");
	});

	// ── 4x3 State x Event Matrix ───────────────────────────────────

	describe("upcoming state", () => {
		it("upcoming -> due on DUE_DATE_REACHED", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("upcoming"),
				DUE_DATE_REACHED
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

		it("upcoming ignores PAYMENT_APPLIED", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("upcoming"),
				PAYMENT_APPLIED
			);
			expect(next.value).toBe("upcoming");
			expect(actions).toHaveLength(0);
		});
	});

	describe("due state", () => {
		it("due ignores DUE_DATE_REACHED", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("due"),
				DUE_DATE_REACHED
			);
			expect(next.value).toBe("due");
			expect(actions).toHaveLength(0);
		});

		it("due -> overdue on GRACE_PERIOD_EXPIRED fires emitObligationOverdue", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("due"),
				GRACE_PERIOD_EXPIRED
			);
			expect(next.value).toBe("overdue");
			expect(actions.map((a) => a.type)).toContain("emitObligationOverdue");
		});

		it("due -> settled on PAYMENT_APPLIED fires emitObligationSettled", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("due"),
				PAYMENT_APPLIED
			);
			expect(next.value).toBe("settled");
			expect(actions.map((a) => a.type)).toContain("emitObligationSettled");
		});
	});

	describe("overdue state", () => {
		it("overdue ignores DUE_DATE_REACHED", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("overdue"),
				DUE_DATE_REACHED
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

		it("overdue -> settled on PAYMENT_APPLIED fires emitObligationSettled", () => {
			const [next, actions] = transition(
				obligationMachine,
				snapshotAt("overdue"),
				PAYMENT_APPLIED
			);
			expect(next.value).toBe("settled");
			expect(actions.map((a) => a.type)).toContain("emitObligationSettled");
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
});
