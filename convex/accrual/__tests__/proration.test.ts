import { describe, expect, it } from "vitest";
import {
	calculateAccrualForPeriods,
	calculatePeriodAccrual,
} from "../interestMath";
import type { OwnershipPeriod } from "../types";

function period(overrides: Partial<OwnershipPeriod>): OwnershipPeriod {
	return {
		lenderId: "lender-a",
		mortgageId: "m-proration",
		fraction: 1,
		fromDate: "2026-01-01",
		toDate: null,
		...overrides,
	};
}

describe("proration", () => {
	it("gives the closing date to the seller and starts the buyer the next day", () => {
		const annualRate = 0.1;
		const principal = 100_000;

		const seller = calculateAccrualForPeriods(
			[
				period({
					fraction: 1,
					fromDate: "2026-01-01",
					toDate: "2026-01-15",
				}),
				period({
					fraction: 0.5,
					fromDate: "2026-01-16",
					toDate: "2026-01-31",
				}),
			],
			annualRate,
			principal,
			"2026-01-01",
			"2026-01-31"
		);
		const buyer = calculateAccrualForPeriods(
			[
				period({
					lenderId: "lender-b",
					fraction: 0.5,
					fromDate: "2026-01-16",
					toDate: "2026-01-31",
				}),
			],
			annualRate,
			principal,
			"2026-01-01",
			"2026-01-31"
		);
		const singleOwner = calculatePeriodAccrual(annualRate, 1, principal, 31);

		expect(seller + buyer).toBeCloseTo(singleOwner, 10);
	});

	it("keeps split-owner accrual equal to the single-owner equivalent over the same range", () => {
		const annualRate = 0.12;
		const principal = 250_000;

		const singleOwner = calculatePeriodAccrual(annualRate, 1, principal, 30);
		const seller = calculateAccrualForPeriods(
			[
				period({
					fraction: 1,
					fromDate: "2026-02-01",
					toDate: "2026-02-10",
				}),
				period({
					fraction: 0.7,
					fromDate: "2026-02-11",
					toDate: "2026-03-02",
				}),
			],
			annualRate,
			principal,
			"2026-02-01",
			"2026-03-02"
		);
		const buyer = calculateAccrualForPeriods(
			[
				period({
					lenderId: "lender-b",
					fraction: 0.3,
					fromDate: "2026-02-11",
					toDate: "2026-03-02",
				}),
			],
			annualRate,
			principal,
			"2026-02-01",
			"2026-03-02"
		);

		expect(seller + buyer).toBeCloseTo(singleOwner, 10);
	});
});
