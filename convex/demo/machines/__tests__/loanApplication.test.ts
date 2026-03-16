import { describe, expect, it } from "vitest";
import { transition } from "xstate";
import { loanApplicationMachine } from "../loanApplication.machine";

// ── Helpers ─────────────────────────────────────────────────────

/** Create a resolved state at `value` with the given context data. */
function stateAt(
	value: string,
	data?: { applicantName?: string; loanAmount?: number }
) {
	return loanApplicationMachine.resolveState({
		value,
		context: {
			entityId: "test-entity-id",
			data,
		},
	});
}

/** Attempt a transition and return [nextStateValue, actionTypes]. */
function tryTransition(
	value: string,
	eventType: string,
	data?: { applicantName?: string; loanAmount?: number }
): [string, string[]] {
	const state = stateAt(value, data);
	const event = { type: eventType } as Parameters<
		(typeof loanApplicationMachine)["transition"]
	>[1];
	const [nextState, actions] = transition(loanApplicationMachine, state, event);
	const nextValue =
		typeof nextState.value === "string"
			? nextState.value
			: JSON.stringify(nextState.value);
	const actionTypes = actions
		.map((a) => a.type as string)
		.filter((name) => !name.startsWith("xstate."));
	return [nextValue, actionTypes];
}

// Complete data that satisfies the hasCompleteData guard
const VALID_DATA = { applicantName: "Jane Doe", loanAmount: 100_000 };

// ── Tests ───────────────────────────────────────────────────────

describe("loanApplicationMachine", () => {
	// ── Valid transitions ──────────────────────────────────────

	describe("valid transitions", () => {
		it("draft -> submitted via SUBMIT (with valid data)", () => {
			const [next, actions] = tryTransition("draft", "SUBMIT", VALID_DATA);
			expect(next).toBe("submitted");
			expect(actions).toContain("notifyReviewer");
		});

		it("submitted -> under_review via ASSIGN_REVIEWER", () => {
			const [next] = tryTransition("submitted", "ASSIGN_REVIEWER");
			expect(next).toBe("under_review");
		});

		it("under_review -> approved via APPROVE", () => {
			const [next, actions] = tryTransition("under_review", "APPROVE");
			expect(next).toBe("approved");
			expect(actions).toContain("notifyApplicant");
		});

		it("under_review -> rejected via REJECT", () => {
			const [next, actions] = tryTransition("under_review", "REJECT");
			expect(next).toBe("rejected");
			expect(actions).toContain("notifyApplicant");
		});

		it("under_review -> needs_info via REQUEST_INFO", () => {
			const [next, actions] = tryTransition("under_review", "REQUEST_INFO");
			expect(next).toBe("needs_info");
			expect(actions).toContain("notifyApplicant");
		});

		it("needs_info -> under_review via RESUBMIT", () => {
			const [next, actions] = tryTransition("needs_info", "RESUBMIT");
			expect(next).toBe("under_review");
			expect(actions).toContain("notifyReviewer");
		});

		it("rejected -> draft via REOPEN", () => {
			const [next] = tryTransition("rejected", "REOPEN");
			expect(next).toBe("draft");
		});

		it("approved -> funded via FUND", () => {
			const [next, actions] = tryTransition("approved", "FUND");
			expect(next).toBe("funded");
			expect(actions).toContain("scheduleFunding");
			expect(actions).toContain("generateDocuments");
		});

		it("funded -> closed via CLOSE", () => {
			const [next] = tryTransition("funded", "CLOSE");
			expect(next).toBe("closed");
		});
	});

	// ── Guard: hasCompleteData ─────────────────────────────────

	describe("hasCompleteData guard", () => {
		it("rejects SUBMIT from draft when data is missing", () => {
			const [next] = tryTransition("draft", "SUBMIT", undefined);
			expect(next).toBe("draft");
		});

		it("rejects SUBMIT from draft when applicantName is empty", () => {
			const [next] = tryTransition("draft", "SUBMIT", {
				applicantName: "",
				loanAmount: 100_000,
			});
			expect(next).toBe("draft");
		});

		it("rejects SUBMIT from draft when loanAmount is 0", () => {
			const [next] = tryTransition("draft", "SUBMIT", {
				applicantName: "Jane",
				loanAmount: 0,
			});
			expect(next).toBe("draft");
		});

		it("rejects SUBMIT from draft when loanAmount is missing", () => {
			const [next] = tryTransition("draft", "SUBMIT", {
				applicantName: "Jane",
			});
			expect(next).toBe("draft");
		});
	});

	// ── Invalid events leave state unchanged ──────────────────

	describe("invalid events leave state unchanged", () => {
		it("APPROVE rejected from draft", () => {
			const [next] = tryTransition("draft", "APPROVE", VALID_DATA);
			expect(next).toBe("draft");
		});

		it("REJECT rejected from draft", () => {
			const [next] = tryTransition("draft", "REJECT", VALID_DATA);
			expect(next).toBe("draft");
		});

		it("FUND rejected from submitted", () => {
			const [next] = tryTransition("submitted", "FUND");
			expect(next).toBe("submitted");
		});

		it("CLOSE rejected from draft", () => {
			const [next] = tryTransition("draft", "CLOSE", VALID_DATA);
			expect(next).toBe("draft");
		});

		it("SUBMIT rejected from under_review", () => {
			const [next] = tryTransition("under_review", "SUBMIT");
			expect(next).toBe("under_review");
		});
	});

	// ── Terminal state cannot be escaped ───────────────────────

	describe("terminal state (closed)", () => {
		const allEvents = [
			"SUBMIT",
			"ASSIGN_REVIEWER",
			"APPROVE",
			"REJECT",
			"REQUEST_INFO",
			"RESUBMIT",
			"REOPEN",
			"FUND",
			"CLOSE",
		];

		for (const eventType of allEvents) {
			it(`closed is not escaped by ${eventType}`, () => {
				const [next] = tryTransition("closed", eventType, VALID_DATA);
				expect(next).toBe("closed");
			});
		}
	});

	// ── Actions reported correctly ────────────────────────────

	describe("actions", () => {
		it("SUBMIT with valid data produces notifyReviewer action", () => {
			const [, actions] = tryTransition("draft", "SUBMIT", VALID_DATA);
			expect(actions).toEqual(["notifyReviewer"]);
		});

		it("FUND produces scheduleFunding and generateDocuments actions", () => {
			const [, actions] = tryTransition("approved", "FUND");
			expect(actions).toEqual(["scheduleFunding", "generateDocuments"]);
		});

		it("APPROVE produces notifyApplicant action", () => {
			const [, actions] = tryTransition("under_review", "APPROVE");
			expect(actions).toEqual(["notifyApplicant"]);
		});

		it("REJECT produces notifyApplicant action", () => {
			const [, actions] = tryTransition("under_review", "REJECT");
			expect(actions).toEqual(["notifyApplicant"]);
		});

		it("REQUEST_INFO produces notifyApplicant action", () => {
			const [, actions] = tryTransition("under_review", "REQUEST_INFO");
			expect(actions).toEqual(["notifyApplicant"]);
		});

		it("RESUBMIT produces notifyReviewer action", () => {
			const [, actions] = tryTransition("needs_info", "RESUBMIT");
			expect(actions).toEqual(["notifyReviewer"]);
		});

		it("ASSIGN_REVIEWER produces no custom actions", () => {
			const [, actions] = tryTransition("submitted", "ASSIGN_REVIEWER");
			expect(actions).toEqual([]);
		});

		it("REOPEN produces no custom actions", () => {
			const [, actions] = tryTransition("rejected", "REOPEN");
			expect(actions).toEqual([]);
		});

		it("CLOSE produces no custom actions", () => {
			const [, actions] = tryTransition("funded", "CLOSE");
			expect(actions).toEqual([]);
		});
	});
});
