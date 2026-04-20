import { describe, expect, it } from "vitest";
import { mortgageNominalAnnualRateToDecimal } from "../nominalAnnualRate";

describe("mortgageNominalAnnualRateToDecimal", () => {
	it("passes through legacy decimal nominal rates", () => {
		expect(mortgageNominalAnnualRateToDecimal(0.08)).toBe(0.08);
		expect(mortgageNominalAnnualRateToDecimal(0.0725)).toBe(0.0725);
	});

	it("converts admin percentage-point quotes", () => {
		expect(mortgageNominalAnnualRateToDecimal(7.25)).toBe(0.0725);
		expect(mortgageNominalAnnualRateToDecimal(12)).toBe(0.12);
	});

	it("handles non-finite and non-positive values", () => {
		expect(mortgageNominalAnnualRateToDecimal(Number.NaN)).toBe(Number.NaN);
		expect(mortgageNominalAnnualRateToDecimal(0)).toBe(0);
		expect(mortgageNominalAnnualRateToDecimal(-1)).toBe(-1);
	});
});
