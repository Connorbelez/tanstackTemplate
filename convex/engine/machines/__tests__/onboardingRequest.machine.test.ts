import { describe, expect, it } from "vitest";
import { getNextSnapshot } from "xstate";
import { onboardingRequestMachine } from "../onboardingRequest.machine";

function snapshotAt(stateValue: string) {
	return onboardingRequestMachine.resolveState({
		value: stateValue,
		context: { requestId: "test-id" },
	});
}

describe("onboardingRequest machine", () => {
	// ── Happy paths ──────────────────────────────────────────────────

	it("transitions from pending_review to approved on APPROVE", () => {
		const current = snapshotAt("pending_review");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "APPROVE",
		});
		expect(next.value).toBe("approved");
	});

	it("transitions from pending_review to rejected on REJECT", () => {
		const current = snapshotAt("pending_review");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "REJECT",
		});
		expect(next.value).toBe("rejected");
	});

	it("transitions from approved to role_assigned on ASSIGN_ROLE", () => {
		const current = snapshotAt("approved");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "ASSIGN_ROLE",
		});
		expect(next.value).toBe("role_assigned");
	});

	// ── Invalid transitions (should stay in same state) ──────────────

	it("does not accept ASSIGN_ROLE in pending_review", () => {
		const current = snapshotAt("pending_review");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "ASSIGN_ROLE",
		});
		expect(next.value).toBe("pending_review");
	});

	it("does not accept APPROVE in approved state", () => {
		const current = snapshotAt("approved");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "APPROVE",
		});
		expect(next.value).toBe("approved");
	});

	it("does not accept REJECT in approved state (cannot reject after approval)", () => {
		const current = snapshotAt("approved");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "REJECT",
		});
		expect(next.value).toBe("approved");
	});

	// ── Terminal states ──────────────────────────────────────────────

	it("cannot escape terminal states", () => {
		const terminalStates = ["rejected", "role_assigned"];
		const events = ["APPROVE", "REJECT", "ASSIGN_ROLE"] as const;

		for (const terminal of terminalStates) {
			for (const eventType of events) {
				const current = snapshotAt(terminal);
				const next = getNextSnapshot(onboardingRequestMachine, current, {
					type: eventType,
				});
				expect(next.value).toBe(terminal);
			}
		}
	});

	// ── Machine metadata ─────────────────────────────────────────────

	it("starts in pending_review state", () => {
		expect(onboardingRequestMachine.config.initial).toBe("pending_review");
	});

	it("has the correct machine id", () => {
		expect(onboardingRequestMachine.id).toBe("onboardingRequest");
	});
});
