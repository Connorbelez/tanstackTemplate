import { describe, expect, it } from "vitest";
import { calculateServicingFee } from "../servicingFee";

describe("calculateServicingFee", () => {
	// Acceptance criteria from ENG-80, expressed in cents.
	it("$100K @ 1% → 8,333 cents/mo", () => {
		expect(calculateServicingFee(0.01, 10_000_000)).toBe(8333);
	});

	it("$500K @ 1% → 41,667 cents/mo", () => {
		expect(calculateServicingFee(0.01, 50_000_000)).toBe(41_667);
	});

	it("$250K @ 1.5% → 31,250 cents/mo", () => {
		expect(calculateServicingFee(0.015, 25_000_000)).toBe(31_250);
	});

	// Edge cases
	it("returns 0 for zero rate", () => {
		expect(calculateServicingFee(0, 10_000_000)).toBe(0);
	});

	it("returns 0 for zero principal", () => {
		expect(calculateServicingFee(0.01, 0)).toBe(0);
	});
});
