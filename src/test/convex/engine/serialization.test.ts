import { describe, expect, it } from "vitest";
import { getNextSnapshot } from "xstate";
import { dealMachine } from "../../../../convex/engine/machines/deal.machine";
import {
	deserializeState,
	serializeState,
} from "../../../../convex/engine/serialization";

describe("serializeState", () => {
	it("passes flat strings through unchanged", () => {
		expect(serializeState("initiated")).toBe("initiated");
		expect(serializeState("confirmed")).toBe("confirmed");
		expect(serializeState("failed")).toBe("failed");
	});

	it("serializes single-level compound states to dot-notation", () => {
		expect(serializeState({ lawyerOnboarding: "pending" })).toBe(
			"lawyerOnboarding.pending"
		);
		expect(serializeState({ lawyerOnboarding: "verified" })).toBe(
			"lawyerOnboarding.verified"
		);
		expect(serializeState({ documentReview: "signed" })).toBe(
			"documentReview.signed"
		);
		expect(serializeState({ fundsTransfer: "pending" })).toBe(
			"fundsTransfer.pending"
		);
	});

	it("serializes nested single-region states recursively", () => {
		expect(serializeState({ phase: { review: "active" } })).toBe(
			"phase.review.active"
		);
	});

	it("throws on parallel states with multiple active regions", () => {
		expect(() => serializeState({ underwriting: "active", legal: "pending" })).toThrow(
			"single-region"
		);
	});
});

describe("deserializeState", () => {
	it("passes flat strings through unchanged", () => {
		expect(deserializeState("initiated")).toBe("initiated");
		expect(deserializeState("confirmed")).toBe("confirmed");
		expect(deserializeState("failed")).toBe("failed");
	});

	it("rehydrates legacy JSON-encoded compound states", () => {
		expect(deserializeState('{"lawyerOnboarding":"verified"}')).toEqual({
			lawyerOnboarding: "verified",
		});
		expect(
			deserializeState('{"phase":{"review":"active"}}')
		).toEqual({
			phase: { review: "active" },
		});
		expect(
			serializeState(deserializeState('{"lawyerOnboarding":"verified"}'))
		).toBe("lawyerOnboarding.verified");
	});

	it("deserializes dot-notation to compound state objects", () => {
		expect(deserializeState("lawyerOnboarding.verified")).toEqual({
			lawyerOnboarding: "verified",
		});
		expect(deserializeState("documentReview.pending")).toEqual({
			documentReview: "pending",
		});
		expect(deserializeState("fundsTransfer.complete")).toEqual({
			fundsTransfer: "complete",
		});
	});

	it("deserializes nested dot-notation recursively", () => {
		expect(deserializeState("phase.review.active")).toEqual({
			phase: { review: "active" },
		});
	});

	it("rejects empty or malformed state strings", () => {
		expect(() => deserializeState("")).toThrow("non-empty status string");
		expect(() => deserializeState(".verified")).toThrow("non-empty state segments");
		expect(() => deserializeState("lawyerOnboarding.")).toThrow(
			"non-empty state segments"
		);
	});

	it("treats malformed legacy JSON-looking values as flat strings", () => {
		expect(deserializeState('{"lawyerOnboarding":')).toBe(
			'{"lawyerOnboarding":'
		);
	});
});

describe("round-trip serialization", () => {
	const allDealStates = [
		"initiated",
		"lawyerOnboarding.pending",
		"lawyerOnboarding.verified",
		"lawyerOnboarding.complete",
		"documentReview.pending",
		"documentReview.signed",
		"documentReview.complete",
		"fundsTransfer.pending",
		"fundsTransfer.complete",
		"confirmed",
		"failed",
	] as const;

	it.each(allDealStates)(
		"serialize -> deserialize -> serialize is identity for %s",
		(state) => {
			expect(serializeState(deserializeState(state))).toBe(state);
		}
	);
});

describe("XState rehydration with dealMachine", () => {
	const defaultContext = { dealId: "test-deal-1" };

	it("rehydrates a flat state and accepts the next valid event", () => {
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

	it("rehydrates a compound state and accepts the next valid event", () => {
		const snapshot = dealMachine.resolveState({
			value: deserializeState("lawyerOnboarding.pending"),
			context: defaultContext,
		});
		const next = getNextSnapshot(dealMachine, snapshot, {
			type: "LAWYER_VERIFIED",
			verificationId: "v-1",
		});

		expect(serializeState(next.value)).toBe("lawyerOnboarding.verified");
	});

	it("keeps the same state when the event is invalid for the rehydrated state", () => {
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

	it("rehydrates a mid-phase state and crosses the phase gate via onDone", () => {
		const snapshot = dealMachine.resolveState({
			value: deserializeState("lawyerOnboarding.verified"),
			context: defaultContext,
		});
		const next = getNextSnapshot(dealMachine, snapshot, {
			type: "REPRESENTATION_CONFIRMED",
		});

		expect(serializeState(next.value)).toBe("documentReview.pending");
	});

	it("round-trips serialized state through the happy path", () => {
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
		] as const;

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
