import { describe, expect, it } from "vitest";
import { getNextSnapshot } from "xstate";
import { dealMachine } from "../machines/deal.machine";
import { mortgageMachine } from "../machines/mortgage.machine";
import { obligationMachine } from "../machines/obligation.machine";
import { onboardingRequestMachine } from "../machines/onboardingRequest.machine";
import { deserializeState, serializeState } from "../serialization";

// ---------------------------------------------------------------------------
// T-005: Backward-compatibility tests (flat-state machines)
// ---------------------------------------------------------------------------

describe("Transition Engine — backward compatibility (flat-state machines)", () => {
	describe("serializeState passthrough for flat states", () => {
		const flatStates = [
			// onboardingRequest
			"pending_review",
			"approved",
			"rejected",
			"role_assigned",
			// mortgage
			"active",
			"delinquent",
			"defaulted",
			"collections",
			"written_off",
			"matured",
			// obligation
			"upcoming",
			"due",
			"overdue",
			"settled",
		];

		it.each(
			flatStates
		)("serializeState('%s') passes through unchanged", (state) => {
			expect(serializeState(state)).toBe(state);
		});

		it.each(
			flatStates
		)("deserializeState('%s') passes through unchanged", (state) => {
			expect(deserializeState(state)).toBe(state);
		});
	});

	describe("onboardingRequest transitions through serialize/deserialize round-trip", () => {
		it("pending_review → APPROVE → approved via round-trip", () => {
			const restored = onboardingRequestMachine.resolveState({
				value: deserializeState("pending_review"),
				context: {},
			});
			const next = getNextSnapshot(onboardingRequestMachine, restored, {
				type: "APPROVE",
			});
			expect(serializeState(next.value)).toBe("approved");
		});

		it("pending_review → REJECT → rejected via round-trip", () => {
			const restored = onboardingRequestMachine.resolveState({
				value: deserializeState("pending_review"),
				context: {},
			});
			const next = getNextSnapshot(onboardingRequestMachine, restored, {
				type: "REJECT",
			});
			expect(serializeState(next.value)).toBe("rejected");
		});

		it("approved → ASSIGN_ROLE → role_assigned via round-trip", () => {
			const restored = onboardingRequestMachine.resolveState({
				value: deserializeState("approved"),
				context: {},
			});
			const next = getNextSnapshot(onboardingRequestMachine, restored, {
				type: "ASSIGN_ROLE",
			});
			expect(serializeState(next.value)).toBe("role_assigned");
		});
	});

	describe("mortgage transitions through serialize/deserialize round-trip", () => {
		it("active → OBLIGATION_OVERDUE → delinquent via round-trip", () => {
			const restored = mortgageMachine.resolveState({
				value: deserializeState("active"),
				context: { lastPaymentAt: Date.now(), missedPayments: 0 },
			});
			const next = getNextSnapshot(mortgageMachine, restored, {
				type: "OBLIGATION_OVERDUE",
				obligationId: "obl-1",
			});
			expect(serializeState(next.value)).toBe("delinquent");
		});

		it("active → MATURED → matured via round-trip", () => {
			const restored = mortgageMachine.resolveState({
				value: deserializeState("active"),
				context: { lastPaymentAt: Date.now(), missedPayments: 0 },
			});
			const next = getNextSnapshot(mortgageMachine, restored, {
				type: "MATURED",
			});
			expect(serializeState(next.value)).toBe("matured");
		});
	});

	describe("obligation transitions through serialize/deserialize round-trip", () => {
		it("upcoming → DUE_DATE_REACHED → due via round-trip", () => {
			const restored = obligationMachine.resolveState({
				value: deserializeState("upcoming"),
				context: {},
			});
			const next = getNextSnapshot(obligationMachine, restored, {
				type: "DUE_DATE_REACHED",
			});
			expect(serializeState(next.value)).toBe("due");
		});

		it("due → GRACE_PERIOD_EXPIRED → overdue via round-trip", () => {
			const restored = obligationMachine.resolveState({
				value: deserializeState("due"),
				context: {},
			});
			const next = getNextSnapshot(obligationMachine, restored, {
				type: "GRACE_PERIOD_EXPIRED",
			});
			expect(serializeState(next.value)).toBe("overdue");
		});

		it("due → PAYMENT_APPLIED → settled via round-trip", () => {
			const restored = obligationMachine.resolveState({
				value: deserializeState("due"),
				context: {},
			});
			const next = getNextSnapshot(obligationMachine, restored, {
				type: "PAYMENT_APPLIED",
				amount: 500,
				paidAt: Date.now(),
			});
			expect(serializeState(next.value)).toBe("settled");
		});
	});
});

// ---------------------------------------------------------------------------
// T-006: Compound state engine integration tests (deal machine)
// ---------------------------------------------------------------------------

describe("Transition Engine — compound state support (deal machine)", () => {
	const defaultContext = { dealId: "test-deal-1" };

	it("DEAL_LOCKED: initiated → lawyerOnboarding.pending (compound state serialized)", () => {
		const snapshot = dealMachine.resolveState({
			value: deserializeState("initiated"),
			context: defaultContext,
		});
		const next = getNextSnapshot(dealMachine, snapshot, {
			type: "DEAL_LOCKED",
			closingDate: 1_700_000_000_000,
		});
		expect(serializeState(next.value)).toBe("lawyerOnboarding.pending");
	});

	it("full happy path: serialize/deserialize at every transition", () => {
		const events = [
			{ type: "DEAL_LOCKED", closingDate: 1_700_000_000_000 },
			{ type: "LAWYER_VERIFIED", verificationId: "v-1" },
			{ type: "REPRESENTATION_CONFIRMED" },
			{ type: "LAWYER_APPROVED_DOCUMENTS" },
			{ type: "ALL_PARTIES_SIGNED" },
			{ type: "FUNDS_RECEIVED", method: "manual" },
		] as const;
		const expectedStates = [
			"lawyerOnboarding.pending",
			"lawyerOnboarding.verified",
			"documentReview.pending",
			"documentReview.signed",
			"fundsTransfer.pending",
			"confirmed",
		];

		let currentState = "initiated";
		for (const [index, event] of events.entries()) {
			const snapshot = dealMachine.resolveState({
				value: deserializeState(currentState),
				context: defaultContext,
			});
			const next = getNextSnapshot(dealMachine, snapshot, event);
			currentState = serializeState(next.value);
			expect(currentState).toBe(expectedStates[index]);
		}
	});
});

// ---------------------------------------------------------------------------
// T-007: Audit journal compound state format tests
// ---------------------------------------------------------------------------

describe("Transition Engine — audit journal compound state format", () => {
	const defaultContext = { dealId: "test-deal-1" };

	it("previousState and newState both use dot-notation for compound states", () => {
		const previousState = "lawyerOnboarding.pending";
		const snapshot = dealMachine.resolveState({
			value: deserializeState(previousState),
			context: defaultContext,
		});
		const next = getNextSnapshot(dealMachine, snapshot, {
			type: "LAWYER_VERIFIED",
			verificationId: "v-1",
		});
		const newState = serializeState(next.value);

		// Both use dot-notation
		expect(previousState).toBe("lawyerOnboarding.pending");
		expect(newState).toBe("lawyerOnboarding.verified");
	});

	it("round-trip preserves dot-notation identity", () => {
		const states = [
			"lawyerOnboarding.pending",
			"lawyerOnboarding.verified",
			"documentReview.pending",
			"documentReview.signed",
			"fundsTransfer.pending",
		];
		for (const state of states) {
			expect(serializeState(deserializeState(state))).toBe(state);
		}
	});
});

// ---------------------------------------------------------------------------
// T-008: Rejected events from compound states
// ---------------------------------------------------------------------------

describe("Transition Engine — rejected events from compound states", () => {
	const defaultContext = { dealId: "test-deal-1" };

	it("wrong-phase event leaves compound state unchanged", () => {
		const snapshot = dealMachine.resolveState({
			value: deserializeState("lawyerOnboarding.pending"),
			context: defaultContext,
		});
		const next = getNextSnapshot(dealMachine, snapshot, {
			type: "FUNDS_RECEIVED",
			method: "manual",
		});
		expect(serializeState(next.value)).toBe("lawyerOnboarding.pending");
	});

	it("terminal state rejects all events", () => {
		for (const terminal of ["confirmed", "failed"]) {
			const snapshot = dealMachine.resolveState({
				value: deserializeState(terminal),
				context: defaultContext,
			});
			const next = getNextSnapshot(dealMachine, snapshot, {
				type: "DEAL_LOCKED",
				closingDate: 1_700_000_000_000,
			});
			expect(serializeState(next.value)).toBe(terminal);
		}
	});
});

// ---------------------------------------------------------------------------
// T-009: DEAL_CANCELLED from compound states
// ---------------------------------------------------------------------------

describe("Transition Engine — DEAL_CANCELLED from compound states", () => {
	const defaultContext = { dealId: "test-deal-1" };
	const compoundStates = [
		"lawyerOnboarding.pending",
		"lawyerOnboarding.verified",
		"documentReview.pending",
		"documentReview.signed",
		"fundsTransfer.pending",
	];

	it.each(
		compoundStates
	)("DEAL_CANCELLED from %s produces dot-notation previousState and flat 'failed' newState", (compoundState) => {
		const snapshot = dealMachine.resolveState({
			value: deserializeState(compoundState),
			context: defaultContext,
		});
		const next = getNextSnapshot(dealMachine, snapshot, {
			type: "DEAL_CANCELLED",
			reason: "test cancellation",
		});

		const previousStateSerialized = serializeState(snapshot.value);
		const newStateSerialized = serializeState(next.value);

		expect(previousStateSerialized).toBe(compoundState);
		expect(newStateSerialized).toBe("failed");
	});

	it("DEAL_CANCELLED from flat 'initiated' also works", () => {
		const snapshot = dealMachine.resolveState({
			value: deserializeState("initiated"),
			context: defaultContext,
		});
		const next = getNextSnapshot(dealMachine, snapshot, {
			type: "DEAL_CANCELLED",
			reason: "test cancellation",
		});
		expect(serializeState(next.value)).toBe("failed");
	});
});
