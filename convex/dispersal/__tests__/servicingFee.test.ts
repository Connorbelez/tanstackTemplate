import { describe, expect, it } from "vitest";
import { calculateServicingFee } from "../servicingFee";

const UNKNOWN_PAYMENT_FREQUENCY_PATTERN =
	/Unknown payment frequency: semi_monthly/;

describe("calculateServicingFee", () => {
	it("uses 12 periods for monthly mortgages", () => {
		expect(calculateServicingFee(0.01, 10_000_000, "monthly")).toBe(8333);
	});

	it("uses 26 periods for bi-weekly mortgages", () => {
		expect(calculateServicingFee(0.01, 10_000_000, "bi_weekly")).toBe(3846);
	});

	it("uses 26 periods for accelerated bi-weekly mortgages", () => {
		expect(
			calculateServicingFee(0.01, 10_000_000, "accelerated_bi_weekly")
		).toBe(3846);
	});

	it("uses 52 periods for weekly mortgages", () => {
		expect(calculateServicingFee(0.01, 10_000_000, "weekly")).toBe(1923);
	});

	it("returns 0 for zero rate", () => {
		expect(calculateServicingFee(0, 10_000_000, "monthly")).toBe(0);
	});

	it("returns 0 for zero principal", () => {
		expect(calculateServicingFee(0.01, 0, "monthly")).toBe(0);
	});

	it("throws for unknown payment frequencies", () => {
		expect(() =>
			calculateServicingFee(0.01, 10_000_000, "semi_monthly" as never)
		).toThrow(UNKNOWN_PAYMENT_FREQUENCY_PATTERN);
	});
});
