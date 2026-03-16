import { describe, expect, it } from "vitest";
import {
	deserializeStatus,
	serializeStatus,
} from "../../../../convex/engine/serialization";

describe("serializeStatus", () => {
	it("returns simple string states as-is", () => {
		expect(serializeStatus("pending_review")).toBe("pending_review");
		expect(serializeStatus("approved")).toBe("approved");
		expect(serializeStatus("")).toBe("");
	});

	it("serializes compound/parallel state objects to JSON", () => {
		const compound = { underwriting: "in_progress", legal: "pending" };
		const result = serializeStatus(compound);
		expect(result).toBe(JSON.stringify(compound));
		expect(typeof result).toBe("string");
	});

	it("serializes nested state objects", () => {
		const nested = { phase: { review: "active" } };
		expect(serializeStatus(nested)).toBe(JSON.stringify(nested));
	});

	it("serializes empty object", () => {
		expect(serializeStatus({})).toBe("{}");
	});
});

describe("deserializeStatus", () => {
	it("returns plain string states as-is", () => {
		expect(deserializeStatus("pending_review")).toBe("pending_review");
		expect(deserializeStatus("approved")).toBe("approved");
	});

	it("returns empty string as-is", () => {
		expect(deserializeStatus("")).toBe("");
	});

	it("parses JSON object strings back to objects", () => {
		const compound = { underwriting: "in_progress", legal: "pending" };
		const serialized = JSON.stringify(compound);
		expect(deserializeStatus(serialized)).toEqual(compound);
	});

	it("parses nested JSON objects", () => {
		const nested = { phase: { review: "active" } };
		expect(deserializeStatus(JSON.stringify(nested))).toEqual(nested);
	});

	it("returns malformed JSON starting with '{' as the raw string (fallback)", () => {
		const malformed = "{not valid json at all";
		expect(deserializeStatus(malformed)).toBe(malformed);
	});

	it("returns strings that don't start with '{' as-is (no parse attempt)", () => {
		// Strings like array JSON or numbers should pass through
		expect(deserializeStatus("[1,2,3]")).toBe("[1,2,3]");
		expect(deserializeStatus("123")).toBe("123");
	});
});

describe("round-trip serialization", () => {
	it("round-trips simple string states", () => {
		const state = "pending_review";
		expect(deserializeStatus(serializeStatus(state))).toBe(state);
	});

	it("round-trips compound state objects", () => {
		const compound = { underwriting: "in_progress", legal: "pending" };
		expect(deserializeStatus(serializeStatus(compound))).toEqual(compound);
	});

	it("round-trips empty object", () => {
		expect(deserializeStatus(serializeStatus({}))).toEqual({});
	});
});
