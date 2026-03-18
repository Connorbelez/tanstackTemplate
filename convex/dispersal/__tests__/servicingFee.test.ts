import { describe, expect, it } from "vitest";
import { calculateServicingFee } from "../servicingFee";

describe("calculateServicingFee", () => {
	// Acceptance criteria from ENG-80
	it("$100K @ 1% → $83.33/mo", () => {
		expect(calculateServicingFee(0.01, 100_000)).toBe(83.33);
	});

	it("$500K @ 1% → $416.67/mo", () => {
		expect(calculateServicingFee(0.01, 500_000)).toBe(416.67);
	});

	it("$250K @ 1.5% → $312.50/mo", () => {
		expect(calculateServicingFee(0.015, 250_000)).toBe(312.5);
	});

	// Edge cases
	it("returns 0 for zero rate", () => {
		expect(calculateServicingFee(0, 100_000)).toBe(0);
	});

	it("returns 0 for zero principal", () => {
		expect(calculateServicingFee(0.01, 0)).toBe(0);
	});
});
