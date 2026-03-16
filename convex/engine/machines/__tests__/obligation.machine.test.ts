import { describe, expect, it } from "vitest";
import { getNextSnapshot } from "xstate";
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

	// ── 4x3 State x Event Matrix ───────────────────────────────────

	describe("upcoming state", () => {
		it("upcoming -> due on DUE_DATE_REACHED", () => {
			const next = getNextSnapshot(
				obligationMachine,
				snapshotAt("upcoming"),
				DUE_DATE_REACHED
			);
			expect(next.value).toBe("due");
		});

		it("upcoming ignores GRACE_PERIOD_EXPIRED", () => {
			const next = getNextSnapshot(
				obligationMachine,
				snapshotAt("upcoming"),
				GRACE_PERIOD_EXPIRED
			);
			expect(next.value).toBe("upcoming");
		});

		it("upcoming ignores PAYMENT_APPLIED", () => {
			const next = getNextSnapshot(
				obligationMachine,
				snapshotAt("upcoming"),
				PAYMENT_APPLIED
			);
			expect(next.value).toBe("upcoming");
		});
	});

	describe("due state", () => {
		it("due ignores DUE_DATE_REACHED", () => {
			const next = getNextSnapshot(
				obligationMachine,
				snapshotAt("due"),
				DUE_DATE_REACHED
			);
			expect(next.value).toBe("due");
		});

		it("due -> overdue on GRACE_PERIOD_EXPIRED", () => {
			const next = getNextSnapshot(
				obligationMachine,
				snapshotAt("due"),
				GRACE_PERIOD_EXPIRED
			);
			expect(next.value).toBe("overdue");
		});

		it("due -> settled on PAYMENT_APPLIED", () => {
			const next = getNextSnapshot(
				obligationMachine,
				snapshotAt("due"),
				PAYMENT_APPLIED
			);
			expect(next.value).toBe("settled");
		});
	});

	describe("overdue state", () => {
		it("overdue ignores DUE_DATE_REACHED", () => {
			const next = getNextSnapshot(
				obligationMachine,
				snapshotAt("overdue"),
				DUE_DATE_REACHED
			);
			expect(next.value).toBe("overdue");
		});

		it("overdue ignores GRACE_PERIOD_EXPIRED", () => {
			const next = getNextSnapshot(
				obligationMachine,
				snapshotAt("overdue"),
				GRACE_PERIOD_EXPIRED
			);
			expect(next.value).toBe("overdue");
		});

		it("overdue -> settled on PAYMENT_APPLIED", () => {
			const next = getNextSnapshot(
				obligationMachine,
				snapshotAt("overdue"),
				PAYMENT_APPLIED
			);
			expect(next.value).toBe("settled");
		});
	});

	// ── Terminal state lockdown ─────────────────────────────────────

	describe("settled (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`settled ignores ${event.type}`, () => {
				const next = getNextSnapshot(
					obligationMachine,
					snapshotAt("settled"),
					event
				);
				expect(next.value).toBe("settled");
			});
		}
	});
});
