import { describe, expect, it } from "vitest";
import { transition } from "xstate";
import {
	COLLECTION_ATTEMPT_MACHINE_VERSION,
	collectionAttemptMachine,
} from "../collectionAttempt.machine";

// ── Helpers ─────────────────────────────────────────────────────────

const DEFAULT_CONTEXT = {
	attemptId: "test-attempt",
	retryCount: 0,
	maxRetries: 3,
};

function snapshotAt(stateValue: string) {
	return collectionAttemptMachine.resolveState({
		value: stateValue,
		context: { ...DEFAULT_CONTEXT },
	});
}

function snapshotWithContext(
	stateValue: string,
	context: { attemptId: string; retryCount: number; maxRetries: number }
) {
	return collectionAttemptMachine.resolveState({
		value: stateValue,
		context,
	});
}

// ── Event factories ─────────────────────────────────────────────────

const DRAW_INITIATED = {
	type: "DRAW_INITIATED" as const,
};
const PROVIDER_ACKNOWLEDGED = {
	type: "PROVIDER_ACKNOWLEDGED" as const,
};
const FUNDS_SETTLED = { type: "FUNDS_SETTLED" as const, settledAt: 1000 };
const DRAW_FAILED = {
	type: "DRAW_FAILED" as const,
	reason: "NSF",
	code: "E001",
};
const RETRY_ELIGIBLE = { type: "RETRY_ELIGIBLE" as const };
const MAX_RETRIES_EXCEEDED = { type: "MAX_RETRIES_EXCEEDED" as const };
const RETRY_INITIATED = {
	type: "RETRY_INITIATED" as const,
};
const ATTEMPT_CANCELLED = {
	type: "ATTEMPT_CANCELLED" as const,
	reason: "user-request",
};
const PAYMENT_REVERSED = {
	type: "PAYMENT_REVERSED" as const,
	reason: "NSF",
};

const ALL_EVENTS = [
	DRAW_INITIATED,
	PROVIDER_ACKNOWLEDGED,
	FUNDS_SETTLED,
	DRAW_FAILED,
	RETRY_ELIGIBLE,
	MAX_RETRIES_EXCEEDED,
	RETRY_INITIATED,
	ATTEMPT_CANCELLED,
	PAYMENT_REVERSED,
] as const;

// ── Tests ───────────────────────────────────────────────────────────

describe("collectionAttempt machine", () => {
	// ── Machine metadata ────────────────────────────────────────────

	it("starts in initiated state", () => {
		expect(collectionAttemptMachine.config.initial).toBe("initiated");
	});

	it("has the correct machine id", () => {
		expect(collectionAttemptMachine.id).toBe("collectionAttempt");
	});

	it("has version 1.2.0", () => {
		expect(collectionAttemptMachine.version).toBe("1.2.0");
		expect(COLLECTION_ATTEMPT_MACHINE_VERSION).toBe("1.2.0");
	});

	it("confirmed is NOT a final state (has outbound PAYMENT_REVERSED transition)", () => {
		expect(collectionAttemptMachine.config.states?.confirmed?.type).not.toBe(
			"final"
		);
	});

	it("reversed is marked as a final state", () => {
		expect(collectionAttemptMachine.config.states?.reversed?.type).toBe(
			"final"
		);
	});

	it("permanent_fail is marked as a final state", () => {
		expect(collectionAttemptMachine.config.states?.permanent_fail?.type).toBe(
			"final"
		);
	});

	it("cancelled is marked as a final state", () => {
		expect(collectionAttemptMachine.config.states?.cancelled?.type).toBe(
			"final"
		);
	});

	// ── 7×8 State × Event Matrix ───────────────────────────────────

	describe("initiated state", () => {
		it("initiated -> pending on DRAW_INITIATED without side effects", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				DRAW_INITIATED
			);
			expect(next.value).toBe("pending");
			expect(actions).toHaveLength(0);
		});

		it("initiated ignores PROVIDER_ACKNOWLEDGED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				PROVIDER_ACKNOWLEDGED
			);
			expect(next.value).toBe("initiated");
			expect(actions).toHaveLength(0);
		});

		it("initiated -> confirmed on FUNDS_SETTLED fires emitPaymentReceived", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				FUNDS_SETTLED
			);
			expect(next.value).toBe("confirmed");
			expect(actions.map((a) => a.type)).toContain("emitPaymentReceived");
		});

		it("initiated -> failed on DRAW_FAILED increments retryCount", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				DRAW_FAILED
			);
			expect(next.value).toBe("failed");
			expect(actions).toHaveLength(0);
			expect(next.context.retryCount).toBe(1);
		});

		it("initiated ignores RETRY_ELIGIBLE", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				RETRY_ELIGIBLE
			);
			expect(next.value).toBe("initiated");
			expect(actions).toHaveLength(0);
		});

		it("initiated ignores MAX_RETRIES_EXCEEDED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				MAX_RETRIES_EXCEEDED
			);
			expect(next.value).toBe("initiated");
			expect(actions).toHaveLength(0);
		});

		it("initiated ignores RETRY_INITIATED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				RETRY_INITIATED
			);
			expect(next.value).toBe("initiated");
			expect(actions).toHaveLength(0);
		});

		it("initiated -> cancelled on ATTEMPT_CANCELLED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				ATTEMPT_CANCELLED
			);
			expect(next.value).toBe("cancelled");
			expect(actions).toHaveLength(0);
		});
	});

	describe("pending state", () => {
		it("pending ignores DRAW_INITIATED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("pending"),
				DRAW_INITIATED
			);
			expect(next.value).toBe("pending");
			expect(actions).toHaveLength(0);
		});

		it("pending ignores PROVIDER_ACKNOWLEDGED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("pending"),
				PROVIDER_ACKNOWLEDGED
			);
			expect(next.value).toBe("pending");
			expect(actions).toHaveLength(0);
		});

		it("pending -> confirmed on FUNDS_SETTLED fires emitPaymentReceived", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("pending"),
				FUNDS_SETTLED
			);
			expect(next.value).toBe("confirmed");
			expect(actions.map((a) => a.type)).toContain("emitPaymentReceived");
		});

		it("pending -> failed on DRAW_FAILED increments retryCount in context", () => {
			const [next] = transition(
				collectionAttemptMachine,
				snapshotAt("pending"),
				DRAW_FAILED
			);
			expect(next.value).toBe("failed");
			expect(next.context.retryCount).toBe(1);
		});

		it("pending ignores RETRY_ELIGIBLE", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("pending"),
				RETRY_ELIGIBLE
			);
			expect(next.value).toBe("pending");
			expect(actions).toHaveLength(0);
		});

		it("pending ignores MAX_RETRIES_EXCEEDED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("pending"),
				MAX_RETRIES_EXCEEDED
			);
			expect(next.value).toBe("pending");
			expect(actions).toHaveLength(0);
		});

		it("pending ignores RETRY_INITIATED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("pending"),
				RETRY_INITIATED
			);
			expect(next.value).toBe("pending");
			expect(actions).toHaveLength(0);
		});

		it("pending ignores ATTEMPT_CANCELLED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("pending"),
				ATTEMPT_CANCELLED
			);
			expect(next.value).toBe("pending");
			expect(actions).toHaveLength(0);
		});
	});

	describe("failed state", () => {
		it("failed ignores DRAW_INITIATED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("failed"),
				DRAW_INITIATED
			);
			expect(next.value).toBe("failed");
			expect(actions).toHaveLength(0);
		});

		it("failed ignores PROVIDER_ACKNOWLEDGED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("failed"),
				PROVIDER_ACKNOWLEDGED
			);
			expect(next.value).toBe("failed");
			expect(actions).toHaveLength(0);
		});

		it("failed ignores FUNDS_SETTLED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("failed"),
				FUNDS_SETTLED
			);
			expect(next.value).toBe("failed");
			expect(actions).toHaveLength(0);
		});

		it("failed ignores DRAW_FAILED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("failed"),
				DRAW_FAILED
			);
			expect(next.value).toBe("failed");
			expect(actions).toHaveLength(0);
		});

		it("failed -> retry_scheduled on RETRY_ELIGIBLE (guard passes) fires scheduleRetryEntry", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("failed"),
				RETRY_ELIGIBLE
			);
			expect(next.value).toBe("retry_scheduled");
			expect(actions.map((a) => a.type)).toContain("scheduleRetryEntry");
		});

		it("failed -> permanent_fail on MAX_RETRIES_EXCEEDED fires emitCollectionFailed and notifyAdmin", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("failed"),
				MAX_RETRIES_EXCEEDED
			);
			expect(next.value).toBe("permanent_fail");
			const actionTypes = actions.map((a) => a.type);
			expect(actionTypes).toContain("emitCollectionFailed");
			expect(actionTypes).toContain("notifyAdmin");
		});

		it("failed ignores RETRY_INITIATED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("failed"),
				RETRY_INITIATED
			);
			expect(next.value).toBe("failed");
			expect(actions).toHaveLength(0);
		});

		it("failed ignores ATTEMPT_CANCELLED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("failed"),
				ATTEMPT_CANCELLED
			);
			expect(next.value).toBe("failed");
			expect(actions).toHaveLength(0);
		});
	});

	describe("retry_scheduled state", () => {
		it("retry_scheduled ignores DRAW_INITIATED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("retry_scheduled"),
				DRAW_INITIATED
			);
			expect(next.value).toBe("retry_scheduled");
			expect(actions).toHaveLength(0);
		});

		it("retry_scheduled ignores PROVIDER_ACKNOWLEDGED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("retry_scheduled"),
				PROVIDER_ACKNOWLEDGED
			);
			expect(next.value).toBe("retry_scheduled");
			expect(actions).toHaveLength(0);
		});

		it("retry_scheduled ignores FUNDS_SETTLED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("retry_scheduled"),
				FUNDS_SETTLED
			);
			expect(next.value).toBe("retry_scheduled");
			expect(actions).toHaveLength(0);
		});

		it("retry_scheduled ignores DRAW_FAILED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("retry_scheduled"),
				DRAW_FAILED
			);
			expect(next.value).toBe("retry_scheduled");
			expect(actions).toHaveLength(0);
		});

		it("retry_scheduled ignores RETRY_ELIGIBLE", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("retry_scheduled"),
				RETRY_ELIGIBLE
			);
			expect(next.value).toBe("retry_scheduled");
			expect(actions).toHaveLength(0);
		});

		it("retry_scheduled ignores MAX_RETRIES_EXCEEDED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("retry_scheduled"),
				MAX_RETRIES_EXCEEDED
			);
			expect(next.value).toBe("retry_scheduled");
			expect(actions).toHaveLength(0);
		});

		it("retry_scheduled -> pending on RETRY_INITIATED without side effects", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("retry_scheduled"),
				RETRY_INITIATED
			);
			expect(next.value).toBe("pending");
			expect(actions).toHaveLength(0);
		});

		it("retry_scheduled ignores ATTEMPT_CANCELLED", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("retry_scheduled"),
				ATTEMPT_CANCELLED
			);
			expect(next.value).toBe("retry_scheduled");
			expect(actions).toHaveLength(0);
		});
	});

	describe("confirmed state", () => {
		it("confirmed -> reversed on PAYMENT_REVERSED fires emitPaymentReversed", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("confirmed"),
				PAYMENT_REVERSED
			);
			expect(next.value).toBe("reversed");
			expect(actions.map((a) => a.type)).toContain("emitPaymentReversed");
		});

		for (const event of ALL_EVENTS.filter(
			(e) => e.type !== "PAYMENT_REVERSED"
		)) {
			it(`confirmed ignores ${event.type}`, () => {
				const [next, actions] = transition(
					collectionAttemptMachine,
					snapshotAt("confirmed"),
					event
				);
				expect(next.value).toBe("confirmed");
				if (event.type === "FUNDS_SETTLED") {
					expect(actions.map((a) => a.type)).toContain(
						"recordSettlementObserved"
					);
				} else {
					expect(actions).toHaveLength(0);
				}
			});
		}
	});

	describe("reversed (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`reversed ignores ${event.type}`, () => {
				const [next, actions] = transition(
					collectionAttemptMachine,
					snapshotAt("reversed"),
					event
				);
				expect(next.value).toBe("reversed");
				expect(actions).toHaveLength(0);
			});
		}
	});

	describe("permanent_fail (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`permanent_fail ignores ${event.type}`, () => {
				const [next, actions] = transition(
					collectionAttemptMachine,
					snapshotAt("permanent_fail"),
					event
				);
				expect(next.value).toBe("permanent_fail");
				expect(actions).toHaveLength(0);
			});
		}
	});

	describe("cancelled (terminal)", () => {
		for (const event of ALL_EVENTS) {
			it(`cancelled ignores ${event.type}`, () => {
				const [next, actions] = transition(
					collectionAttemptMachine,
					snapshotAt("cancelled"),
					event
				);
				expect(next.value).toBe("cancelled");
				expect(actions).toHaveLength(0);
			});
		}
	});

	// ── Guard-specific tests ────────────────────────────────────────

	describe("canRetry guard", () => {
		it("allows RETRY_ELIGIBLE when retryCount < maxRetries", () => {
			const snap = snapshotWithContext("failed", {
				attemptId: "test-attempt",
				retryCount: 1,
				maxRetries: 3,
			});
			const [next, actions] = transition(
				collectionAttemptMachine,
				snap,
				RETRY_ELIGIBLE
			);
			expect(next.value).toBe("retry_scheduled");
			expect(actions.map((a) => a.type)).toContain("scheduleRetryEntry");
		});

		it("blocks RETRY_ELIGIBLE when retryCount >= maxRetries (stays in failed)", () => {
			const snap = snapshotWithContext("failed", {
				attemptId: "test-attempt",
				retryCount: 3,
				maxRetries: 3,
			});
			const [next, actions] = transition(
				collectionAttemptMachine,
				snap,
				RETRY_ELIGIBLE
			);
			expect(next.value).toBe("failed");
			expect(actions).toHaveLength(0);
		});

		it("blocks RETRY_ELIGIBLE when retryCount exceeds maxRetries", () => {
			const snap = snapshotWithContext("failed", {
				attemptId: "test-attempt",
				retryCount: 5,
				maxRetries: 3,
			});
			const [next, actions] = transition(
				collectionAttemptMachine,
				snap,
				RETRY_ELIGIBLE
			);
			expect(next.value).toBe("failed");
			expect(actions).toHaveLength(0);
		});
	});

	// ── Happy path integration tests ────────────────────────────────

	describe("happy paths", () => {
		it("legacy manual compatibility path: initiated -> confirmed (skips pending)", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				FUNDS_SETTLED
			);
			expect(next.value).toBe("confirmed");
			expect(actions.map((a) => a.type)).toContain("emitPaymentReceived");
		});

		it("async path: initiated -> pending -> confirmed", () => {
			const [step1] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				DRAW_INITIATED
			);
			expect(step1.value).toBe("pending");

			const [step2, actions2] = transition(
				collectionAttemptMachine,
				step1,
				FUNDS_SETTLED
			);
			expect(step2.value).toBe("confirmed");
			expect(actions2.map((a) => a.type)).toContain("emitPaymentReceived");
		});

		it("async path with failure: initiated -> pending -> failed", () => {
			const [step1] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				DRAW_INITIATED
			);
			expect(step1.value).toBe("pending");

			const [step2] = transition(collectionAttemptMachine, step1, DRAW_FAILED);
			expect(step2.value).toBe("failed");
			expect(step2.context.retryCount).toBe(1);
		});

		it("retry path: failed -> retry_scheduled -> pending -> confirmed", () => {
			const [step1, actions1] = transition(
				collectionAttemptMachine,
				snapshotAt("failed"),
				RETRY_ELIGIBLE
			);
			expect(step1.value).toBe("retry_scheduled");
			expect(actions1.map((a) => a.type)).toContain("scheduleRetryEntry");

			const [step2, actions2] = transition(
				collectionAttemptMachine,
				step1,
				RETRY_INITIATED
			);
			expect(step2.value).toBe("pending");
			expect(actions2).toHaveLength(0);

			const [step3, actions3] = transition(
				collectionAttemptMachine,
				step2,
				FUNDS_SETTLED
			);
			expect(step3.value).toBe("confirmed");
			expect(actions3.map((a) => a.type)).toContain("emitPaymentReceived");
		});

		it("max retries path: failed -> permanent_fail", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("failed"),
				MAX_RETRIES_EXCEEDED
			);
			expect(next.value).toBe("permanent_fail");
			const actionTypes = actions.map((a) => a.type);
			expect(actionTypes).toContain("emitCollectionFailed");
			expect(actionTypes).toContain("notifyAdmin");
		});

		it("cancel path: initiated -> cancelled", () => {
			const [next, actions] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				ATTEMPT_CANCELLED
			);
			expect(next.value).toBe("cancelled");
			expect(actions).toHaveLength(0);
		});

		it("reversal path: initiated -> pending -> confirmed -> reversed", () => {
			const [step1] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				DRAW_INITIATED
			);
			expect(step1.value).toBe("pending");

			const [step2] = transition(
				collectionAttemptMachine,
				step1,
				FUNDS_SETTLED
			);
			expect(step2.value).toBe("confirmed");

			const [step3, actions3] = transition(
				collectionAttemptMachine,
				step2,
				PAYMENT_REVERSED
			);
			expect(step3.value).toBe("reversed");
			expect(actions3.map((a) => a.type)).toContain("emitPaymentReversed");
		});

		it("manual payment reversal path: initiated -> confirmed -> reversed", () => {
			const [step1] = transition(
				collectionAttemptMachine,
				snapshotAt("initiated"),
				FUNDS_SETTLED
			);
			expect(step1.value).toBe("confirmed");

			const [step2, actions2] = transition(
				collectionAttemptMachine,
				step1,
				PAYMENT_REVERSED
			);
			expect(step2.value).toBe("reversed");
			expect(actions2.map((a) => a.type)).toContain("emitPaymentReversed");
		});
	});
});
