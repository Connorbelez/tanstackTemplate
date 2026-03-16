import { describe, expect, it } from "vitest";
import { getNextSnapshot } from "xstate";
import type { MortgageMachineContext } from "../mortgage.machine";
import { mortgageMachine } from "../mortgage.machine";

// ── Helpers ─────────────────────────────────────────────────────────

const DEFAULT_CONTEXT: MortgageMachineContext = {
	missedPayments: 0,
	lastPaymentAt: 0,
};

function snapshotAt(
	stateValue: string,
	context: MortgageMachineContext = DEFAULT_CONTEXT
) {
	return mortgageMachine.resolveState({ value: stateValue, context });
}

function ctxWith(
	overrides: Partial<MortgageMachineContext>
): MortgageMachineContext {
	return { ...DEFAULT_CONTEXT, ...overrides };
}

// Event factories
const OBLIGATION_OVERDUE = {
	type: "OBLIGATION_OVERDUE" as const,
	obligationId: "obl_1",
};
const PAYMENT_CONFIRMED = {
	type: "PAYMENT_CONFIRMED" as const,
	obligationId: "obl_1",
	amount: 1500,
	paidAt: 1000,
};
const DEFAULT_THRESHOLD_REACHED = {
	type: "DEFAULT_THRESHOLD_REACHED" as const,
};
const COLLECTIONS_INITIATED = { type: "COLLECTIONS_INITIATED" as const };
const WRITE_OFF_APPROVED = { type: "WRITE_OFF_APPROVED" as const };
const MATURED = { type: "MATURED" as const };

const ALL_EVENTS = [
	OBLIGATION_OVERDUE,
	PAYMENT_CONFIRMED,
	DEFAULT_THRESHOLD_REACHED,
	COLLECTIONS_INITIATED,
	WRITE_OFF_APPROVED,
	MATURED,
] as const;

// ── Tests ───────────────────────────────────────────────────────────

describe("mortgage machine", () => {
	// ── Machine metadata ────────────────────────────────────────────

	it("starts in active state", () => {
		expect(mortgageMachine.config.initial).toBe("active");
	});

	it("has the correct machine id", () => {
		expect(mortgageMachine.id).toBe("mortgage");
	});

	// ── 6x6 State x Event Matrix ───────────────────────────────────

	describe("active state", () => {
		it("active -> delinquent on OBLIGATION_OVERDUE", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("active"),
				OBLIGATION_OVERDUE
			);
			expect(next.value).toBe("delinquent");
		});

		it("active -> active on PAYMENT_CONFIRMED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("active"),
				PAYMENT_CONFIRMED
			);
			expect(next.value).toBe("active");
		});

		it("active ignores DEFAULT_THRESHOLD_REACHED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("active"),
				DEFAULT_THRESHOLD_REACHED
			);
			expect(next.value).toBe("active");
		});

		it("active ignores COLLECTIONS_INITIATED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("active"),
				COLLECTIONS_INITIATED
			);
			expect(next.value).toBe("active");
		});

		it("active ignores WRITE_OFF_APPROVED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("active"),
				WRITE_OFF_APPROVED
			);
			expect(next.value).toBe("active");
		});

		it("active -> matured on MATURED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("active"),
				MATURED
			);
			expect(next.value).toBe("matured");
		});
	});

	describe("delinquent state", () => {
		it("delinquent -> delinquent on OBLIGATION_OVERDUE", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 1 })),
				OBLIGATION_OVERDUE
			);
			expect(next.value).toBe("delinquent");
		});

		it("delinquent -> active on PAYMENT_CONFIRMED when allOverduePaid (cure)", () => {
			// missedPayments = 1 -> guard checks <= 1 (pre-decrement) -> passes
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 1 })),
				PAYMENT_CONFIRMED
			);
			expect(next.value).toBe("active");
		});

		it("delinquent -> delinquent on PAYMENT_CONFIRMED when guard fails", () => {
			// missedPayments = 2 -> guard checks <= 1 -> fails -> fallthrough
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 2 })),
				PAYMENT_CONFIRMED
			);
			expect(next.value).toBe("delinquent");
		});

		it("delinquent -> defaulted on DEFAULT_THRESHOLD_REACHED when gracePeriodExpired", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 3 })),
				DEFAULT_THRESHOLD_REACHED
			);
			expect(next.value).toBe("defaulted");
		});

		it("delinquent stays on DEFAULT_THRESHOLD_REACHED when guard fails", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 2 })),
				DEFAULT_THRESHOLD_REACHED
			);
			expect(next.value).toBe("delinquent");
		});

		it("delinquent ignores COLLECTIONS_INITIATED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 1 })),
				COLLECTIONS_INITIATED
			);
			expect(next.value).toBe("delinquent");
		});

		it("delinquent ignores WRITE_OFF_APPROVED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 1 })),
				WRITE_OFF_APPROVED
			);
			expect(next.value).toBe("delinquent");
		});

		it("delinquent ignores MATURED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 1 })),
				MATURED
			);
			expect(next.value).toBe("delinquent");
		});
	});

	describe("defaulted state", () => {
		it("defaulted ignores OBLIGATION_OVERDUE", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("defaulted"),
				OBLIGATION_OVERDUE
			);
			expect(next.value).toBe("defaulted");
		});

		it("defaulted ignores PAYMENT_CONFIRMED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("defaulted"),
				PAYMENT_CONFIRMED
			);
			expect(next.value).toBe("defaulted");
		});

		it("defaulted ignores DEFAULT_THRESHOLD_REACHED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("defaulted"),
				DEFAULT_THRESHOLD_REACHED
			);
			expect(next.value).toBe("defaulted");
		});

		it("defaulted -> collections on COLLECTIONS_INITIATED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("defaulted"),
				COLLECTIONS_INITIATED
			);
			expect(next.value).toBe("collections");
		});

		it("defaulted ignores WRITE_OFF_APPROVED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("defaulted"),
				WRITE_OFF_APPROVED
			);
			expect(next.value).toBe("defaulted");
		});

		it("defaulted ignores MATURED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("defaulted"),
				MATURED
			);
			expect(next.value).toBe("defaulted");
		});
	});

	describe("collections state", () => {
		it("collections ignores OBLIGATION_OVERDUE", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("collections"),
				OBLIGATION_OVERDUE
			);
			expect(next.value).toBe("collections");
		});

		it("collections ignores PAYMENT_CONFIRMED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("collections"),
				PAYMENT_CONFIRMED
			);
			expect(next.value).toBe("collections");
		});

		it("collections ignores DEFAULT_THRESHOLD_REACHED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("collections"),
				DEFAULT_THRESHOLD_REACHED
			);
			expect(next.value).toBe("collections");
		});

		it("collections ignores COLLECTIONS_INITIATED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("collections"),
				COLLECTIONS_INITIATED
			);
			expect(next.value).toBe("collections");
		});

		it("collections -> written_off on WRITE_OFF_APPROVED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("collections"),
				WRITE_OFF_APPROVED
			);
			expect(next.value).toBe("written_off");
		});

		it("collections ignores MATURED", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("collections"),
				MATURED
			);
			expect(next.value).toBe("collections");
		});
	});

	// ── Terminal state lockdown ─────────────────────────────────────

	describe("written_off (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`written_off ignores ${event.type}`, () => {
				const next = getNextSnapshot(
					mortgageMachine,
					snapshotAt("written_off"),
					event
				);
				expect(next.value).toBe("written_off");
			});
		}
	});

	describe("matured (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`matured ignores ${event.type}`, () => {
				const next = getNextSnapshot(
					mortgageMachine,
					snapshotAt("matured"),
					event
				);
				expect(next.value).toBe("matured");
			});
		}
	});

	// ── Guard coverage ──────────────────────────────────────────────

	describe("allOverduePaid guard", () => {
		it("passes when missedPayments = 0 (0 <= 1)", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 0 })),
				PAYMENT_CONFIRMED
			);
			expect(next.value).toBe("active");
		});

		it("passes when missedPayments = 1 (1 <= 1, pre-decrement)", () => {
			// XState v5 evaluates guards BEFORE assign actions.
			// With missedPayments = 1, the guard sees 1 <= 1 -> true.
			// After the transition, recordPayment decrements to 0.
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 1 })),
				PAYMENT_CONFIRMED
			);
			expect(next.value).toBe("active");
		});

		it("fails when missedPayments = 2 (2 > 1)", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 2 })),
				PAYMENT_CONFIRMED
			);
			expect(next.value).toBe("delinquent");
		});
	});

	describe("gracePeriodExpired guard", () => {
		it("fails when missedPayments = 2 (2 < 3)", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 2 })),
				DEFAULT_THRESHOLD_REACHED
			);
			expect(next.value).toBe("delinquent");
		});

		it("passes when missedPayments = 3 (3 >= 3)", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 3 })),
				DEFAULT_THRESHOLD_REACHED
			);
			expect(next.value).toBe("defaulted");
		});

		it("passes when missedPayments = 4 (4 >= 3)", () => {
			const next = getNextSnapshot(
				mortgageMachine,
				snapshotAt("delinquent", ctxWith({ missedPayments: 4 })),
				DEFAULT_THRESHOLD_REACHED
			);
			expect(next.value).toBe("defaulted");
		});
	});

	// ── Context accumulation trace ──────────────────────────────────

	describe("context accumulation trace", () => {
		it("tracks missedPayments through overdue -> overdue -> pay (stay) -> pay (cure)", () => {
			// Step 0: active, missedPayments = 0
			const s0 = snapshotAt("active");
			expect(s0.context.missedPayments).toBe(0);

			// Step 1: OBLIGATION_OVERDUE -> delinquent, missedPayments = 1
			const s1 = getNextSnapshot(mortgageMachine, s0, OBLIGATION_OVERDUE);
			expect(s1.value).toBe("delinquent");
			expect(s1.context.missedPayments).toBe(1);

			// Step 2: OBLIGATION_OVERDUE -> delinquent, missedPayments = 2
			const s2 = getNextSnapshot(mortgageMachine, s1, OBLIGATION_OVERDUE);
			expect(s2.value).toBe("delinquent");
			expect(s2.context.missedPayments).toBe(2);

			// Step 3: PAYMENT_CONFIRMED -> delinquent (guard fails: 2 > 1), missedPayments = 1
			const s3 = getNextSnapshot(mortgageMachine, s2, PAYMENT_CONFIRMED);
			expect(s3.value).toBe("delinquent");
			expect(s3.context.missedPayments).toBe(1);

			// Step 4: PAYMENT_CONFIRMED -> active (guard passes: 1 <= 1, cure!), missedPayments = 0
			const s4 = getNextSnapshot(mortgageMachine, s3, PAYMENT_CONFIRMED);
			expect(s4.value).toBe("active");
			expect(s4.context.missedPayments).toBe(0);
		});
	});

	// ── Guard-before-assign timing ──────────────────────────────────

	describe("guard-before-assign timing (XState v5)", () => {
		it("cure triggers at missedPayments = 1 because guard evaluates before decrement", () => {
			// XState v5 evaluates guards BEFORE executing assign actions.
			// The allOverduePaid guard uses <= 1 (not <= 0) to account for this:
			// - Guard sees pre-decrement value of 1
			// - 1 <= 1 evaluates to true -> transition to active fires
			// - THEN recordPayment decrements missedPayments to 0
			//
			// If we had used <= 0, the cure would never trigger when exactly
			// 1 missed payment remains, because the guard would see 1 > 0 and fail.
			const snapshot = snapshotAt("delinquent", ctxWith({ missedPayments: 1 }));
			const next = getNextSnapshot(
				mortgageMachine,
				snapshot,
				PAYMENT_CONFIRMED
			);

			// Guard passes (pre-decrement: 1 <= 1)
			expect(next.value).toBe("active");
			// Action runs after guard (post-decrement: 1 - 1 = 0)
			expect(next.context.missedPayments).toBe(0);
		});
	});

	// ── Assign action behavior ──────────────────────────────────────

	describe("assign actions", () => {
		it("incrementMissedPayments increases count by 1", () => {
			const snapshot = snapshotAt("active", ctxWith({ missedPayments: 0 }));
			const next = getNextSnapshot(
				mortgageMachine,
				snapshot,
				OBLIGATION_OVERDUE
			);
			expect(next.context.missedPayments).toBe(1);
		});

		it("recordPayment sets lastPaymentAt from event.paidAt", () => {
			const snapshot = snapshotAt("active");
			const next = getNextSnapshot(mortgageMachine, snapshot, {
				type: "PAYMENT_CONFIRMED",
				obligationId: "obl_1",
				amount: 1500,
				paidAt: 42_000,
			});
			expect(next.context.lastPaymentAt).toBe(42_000);
		});

		it("recordPayment decrements missedPayments (floored at 0)", () => {
			// Already at 0, should not go negative
			const snapshot = snapshotAt("active", ctxWith({ missedPayments: 0 }));
			const next = getNextSnapshot(
				mortgageMachine,
				snapshot,
				PAYMENT_CONFIRMED
			);
			expect(next.context.missedPayments).toBe(0);
		});
	});
});
