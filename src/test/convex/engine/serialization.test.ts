import { describe, expect, it } from "vitest";
import { getNextSnapshot } from "xstate";
import { dealMachine } from "../../../../convex/engine/machines/deal.machine";
import {
	deserializeState,
	deserializeStatus,
	serializeState,
	serializeStatus,
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

	it("throws for empty state objects", () => {
		expect(() => serializeState({})).toThrow(
			"serializeStateValue: cannot serialize an empty state object"
		);
	});

	it("throws on parallel states with multiple active regions", () => {
		expect(() =>
			serializeState({ underwriting: "active", legal: "pending" })
		).toThrow(
			"serializeStateValue: parallel states with multiple active regions are not supported by dot-notation serialization"
		);
	});
});

describe("serializeStatus compatibility", () => {
	it("serializes single-region compound states to dot-notation", () => {
		expect(serializeStatus({ lawyerOnboarding: "verified" })).toBe(
			"lawyerOnboarding.verified"
		);
	});

	it("serializes nested state objects to dot-notation", () => {
		const nested = { phase: { review: "active" } };
		expect(serializeStatus(nested)).toBe("phase.review.active");
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
		expect(deserializeState('{"phase":{"review":"active"}}')).toEqual({
			phase: { review: "active" },
		});
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
		expect(() => deserializeState(".verified")).toThrow(
			"non-empty state segments"
		);
		expect(() => deserializeState("lawyerOnboarding.")).toThrow(
			"non-empty state segments"
		);
		expect(() => deserializeState('{"lawyerOnboarding":}')).toThrow(
			"could not parse legacy JSON status"
		);
	});
});

describe("deserializeStatus compatibility", () => {
	it("parses dot-notation states back to objects", () => {
		expect(deserializeStatus("lawyerOnboarding.verified")).toEqual({
			lawyerOnboarding: "verified",
		});
	});

	it("parses nested dot-notation states", () => {
		expect(deserializeStatus("phase.review.active")).toEqual({
			phase: { review: "active" },
		});
	});

	it("parses legacy JSON object strings back to objects", () => {
		const nested = { phase: { review: "active" } };
		expect(deserializeStatus(JSON.stringify(nested))).toEqual(nested);
	});

	it("returns malformed JSON starting with '{' as the raw string", () => {
		const malformed = "{not valid json at all";
		expect(deserializeStatus(malformed)).toBe(malformed);
	});

	it("returns non-object JSON strings as-is", () => {
		expect(deserializeStatus("[1,2,3]")).toBe("[1,2,3]");
		expect(deserializeStatus("123")).toBe("123");
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

	it("round-trips supported compound state objects through compatibility wrappers", () => {
		const state = { lawyerOnboarding: { review: "active" } };
		expect(deserializeStatus(serializeStatus(state))).toEqual(state);
	});

	it("preserves legacy JSON object states during compatibility deserialization", () => {
		const state = { phase: { review: "active" } };
		expect(deserializeStatus(JSON.stringify(state))).toEqual(state);
	});
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
