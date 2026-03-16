import { describe, expect, it } from "vitest";
import { getNextSnapshot } from "xstate";
import { onboardingRequestMachine } from "../onboardingRequest.machine";

function snapshotAt(stateValue: string) {
	return onboardingRequestMachine.resolveState({
		value: stateValue,
		context: {} as Record<string, never>,
	});
}

describe("onboardingRequest machine", () => {
	// ── Happy paths ──────────────────────────────────────────────────

	it("pending_review → approved on APPROVE", () => {
		const current = snapshotAt("pending_review");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "APPROVE",
		});
		expect(next.value).toBe("approved");
	});

	it("pending_review → rejected on REJECT", () => {
		const current = snapshotAt("pending_review");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "REJECT",
		});
		expect(next.value).toBe("rejected");
	});

	it("approved → role_assigned on ASSIGN_ROLE", () => {
		const current = snapshotAt("approved");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "ASSIGN_ROLE",
		});
		expect(next.value).toBe("role_assigned");
	});

	// ── Invalid transitions (should stay in same state) ──────────────

	it("pending_review ignores ASSIGN_ROLE", () => {
		const current = snapshotAt("pending_review");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "ASSIGN_ROLE",
		});
		expect(next.value).toBe("pending_review");
	});

	it("approved ignores APPROVE", () => {
		const current = snapshotAt("approved");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "APPROVE",
		});
		expect(next.value).toBe("approved");
	});

	it("approved ignores REJECT", () => {
		const current = snapshotAt("approved");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "REJECT",
		});
		expect(next.value).toBe("approved");
	});

	// ── Terminal state lockdown ──────────────────────────────────────

	it("rejected ignores APPROVE", () => {
		const current = snapshotAt("rejected");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "APPROVE",
		});
		expect(next.value).toBe("rejected");
	});

	it("rejected ignores REJECT", () => {
		const current = snapshotAt("rejected");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "REJECT",
		});
		expect(next.value).toBe("rejected");
	});

	it("rejected ignores ASSIGN_ROLE", () => {
		const current = snapshotAt("rejected");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "ASSIGN_ROLE",
		});
		expect(next.value).toBe("rejected");
	});

	it("role_assigned ignores APPROVE", () => {
		const current = snapshotAt("role_assigned");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "APPROVE",
		});
		expect(next.value).toBe("role_assigned");
	});

	it("role_assigned ignores REJECT", () => {
		const current = snapshotAt("role_assigned");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "REJECT",
		});
		expect(next.value).toBe("role_assigned");
	});

	it("role_assigned ignores ASSIGN_ROLE", () => {
		const current = snapshotAt("role_assigned");
		const next = getNextSnapshot(onboardingRequestMachine, current, {
			type: "ASSIGN_ROLE",
		});
		expect(next.value).toBe("role_assigned");
	});

	// ── Machine metadata ─────────────────────────────────────────────

	it("starts in pending_review state", () => {
		expect(onboardingRequestMachine.config.initial).toBe("pending_review");
	});

	it("has the correct machine id", () => {
		expect(onboardingRequestMachine.id).toBe("onboardingRequest");
	});
});
