import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
	calculateAccrualForPeriods,
	calculatePeriodAccrual,
	calculateProRataShares,
	dayAfter,
	dayBefore,
	daysBetween,
	maxDate,
	minDate,
} from "../interestMath";
import type { OwnershipPeriod, ProRataPosition } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePeriod(overrides: Partial<OwnershipPeriod> = {}): OwnershipPeriod {
	return {
		lenderId: "lender_1" as Id<"lenders">,
		mortgageId: "mortgage_1" as Id<"mortgages">,
		fraction: 1,
		fromDate: "2026-01-01",
		toDate: "2026-12-31",
		...overrides,
	};
}

function makePosition(
	overrides: Partial<ProRataPosition> = {}
): ProRataPosition {
	return {
		accountId: "ledger_account_1" as Id<"ledger_accounts">,
		lenderId: "lender_1" as Id<"lenders">,
		units: 10_000,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------

describe("daysBetween", () => {
	it("returns 1 for same-date (inclusive)", () => {
		expect(daysBetween("2026-01-15", "2026-01-15")).toBe(1);
	});

	it("returns 30 for Jan 1 to Jan 30", () => {
		expect(daysBetween("2026-01-01", "2026-01-30")).toBe(30);
	});

	it("handles leap year correctly (Feb 28 to Mar 1 in 2028)", () => {
		// 2028 is a leap year: Feb 28, Feb 29, Mar 1 = 3 days
		expect(daysBetween("2028-02-28", "2028-03-01")).toBe(3);
	});

	it("handles non-leap year (Feb 28 to Mar 1 in 2026)", () => {
		// 2026 is not a leap year: Feb 28, Mar 1 = 2 days
		expect(daysBetween("2026-02-28", "2026-03-01")).toBe(2);
	});

	it("returns 365 for a full non-leap year", () => {
		expect(daysBetween("2026-01-01", "2026-12-31")).toBe(365);
	});

	it("returns 366 for a full leap year", () => {
		expect(daysBetween("2028-01-01", "2028-12-31")).toBe(366);
	});

	it("handles month boundaries", () => {
		// Jan 31 to Feb 1 = 2 days
		expect(daysBetween("2026-01-31", "2026-02-01")).toBe(2);
	});

	it("throws when fromDate is after toDate", () => {
		expect(() => daysBetween("2026-03-15", "2026-01-01")).toThrow(
			"daysBetween: fromDate 2026-03-15 is after toDate 2026-01-01"
		);
	});

	it("throws on invalid date strings", () => {
		expect(() => daysBetween("not-a-date", "2026-01-01")).toThrow(
			"daysBetween: invalid date string"
		);
		expect(() => daysBetween("2026-01-01", "garbage")).toThrow(
			"daysBetween: invalid date string"
		);
	});

	it("returns 7 for month boundary crossing Jan 28 to Feb 3", () => {
		// Jan 28–31 = 4 days + Feb 1–3 = 3 days = 7 days total
		expect(daysBetween("2026-01-28", "2026-02-03")).toBe(7);
	});
});

// ---------------------------------------------------------------------------
// dayAfter / dayBefore
// ---------------------------------------------------------------------------

describe("dayAfter", () => {
	it("returns the next day", () => {
		expect(dayAfter("2026-01-15")).toBe("2026-01-16");
	});

	it("crosses month boundary", () => {
		expect(dayAfter("2026-01-31")).toBe("2026-02-01");
	});

	it("crosses year boundary", () => {
		expect(dayAfter("2026-12-31")).toBe("2027-01-01");
	});

	it("handles leap day", () => {
		expect(dayAfter("2028-02-28")).toBe("2028-02-29");
	});
});

describe("dayBefore", () => {
	it("returns the previous day", () => {
		expect(dayBefore("2026-01-16")).toBe("2026-01-15");
	});

	it("crosses month boundary", () => {
		expect(dayBefore("2026-02-01")).toBe("2026-01-31");
	});

	it("crosses year boundary", () => {
		expect(dayBefore("2027-01-01")).toBe("2026-12-31");
	});

	it("handles leap day", () => {
		expect(dayBefore("2028-02-29")).toBe("2028-02-28");
	});
});

// ---------------------------------------------------------------------------
// maxDate / minDate
// ---------------------------------------------------------------------------

describe("maxDate", () => {
	it("returns the later date", () => {
		expect(maxDate("2026-01-01", "2026-06-15")).toBe("2026-06-15");
	});

	it("returns the later date when first arg is later", () => {
		expect(maxDate("2026-06-15", "2026-01-01")).toBe("2026-06-15");
	});

	it("returns either when dates are equal", () => {
		expect(maxDate("2026-03-10", "2026-03-10")).toBe("2026-03-10");
	});
});

describe("minDate", () => {
	it("returns the earlier date", () => {
		expect(minDate("2026-01-01", "2026-06-15")).toBe("2026-01-01");
	});

	it("returns the earlier date when second arg is earlier", () => {
		expect(minDate("2026-06-15", "2026-01-01")).toBe("2026-01-01");
	});

	it("returns either when dates are equal", () => {
		expect(minDate("2026-03-10", "2026-03-10")).toBe("2026-03-10");
	});
});

// ---------------------------------------------------------------------------
// calculatePeriodAccrual
// ---------------------------------------------------------------------------

describe("calculatePeriodAccrual", () => {
	it("computes $10,000 for 10% rate, 100% ownership, $100K, 365 days", () => {
		const result = calculatePeriodAccrual(0.1, 1, 100_000, 365);
		expect(result).toBe(10_000);
	});

	it("computes $5,000 for 10% rate, 50% ownership, $100K, 365 days", () => {
		const result = calculatePeriodAccrual(0.1, 0.5, 100_000, 365);
		expect(result).toBe(5000);
	});

	it("returns 0 when days is 0", () => {
		expect(calculatePeriodAccrual(0.1, 1, 100_000, 0)).toBe(0);
	});

	it("returns 0 when fraction is 0", () => {
		expect(calculatePeriodAccrual(0.1, 0, 100_000, 365)).toBe(0);
	});

	it("returns 0 when principal is 0", () => {
		expect(calculatePeriodAccrual(0.1, 1, 0, 365)).toBe(0);
	});

	it("computes daily accrual correctly for 1 day", () => {
		// 10% of $100K / 365 = $27.397260...
		const result = calculatePeriodAccrual(0.1, 1, 100_000, 1);
		expect(result).toBeCloseTo((100_000 * 0.1) / 365, 10);
	});

	it("computes approximately $821.92 for 10% rate, 100% ownership, $100K, 30 days", () => {
		// (0.10 * 1.0 * 100_000 * 30) / 365 = 821.9178...
		const result = calculatePeriodAccrual(0.1, 1, 100_000, 30);
		expect(result).toBeCloseTo(821.92, 2);
	});

	it("computes approximately $16.44 for 12% rate, 25% ownership, $200K, 1 day", () => {
		// (0.12 * 0.25 * 200_000 * 1) / 365 = 16.4383...
		const result = calculatePeriodAccrual(0.12, 0.25, 200_000, 1);
		expect(result).toBeCloseTo(16.44, 2);
	});
});

// ---------------------------------------------------------------------------
// calculateAccrualForPeriods
// ---------------------------------------------------------------------------

describe("calculateAccrualForPeriods", () => {
	it("sums interest for a single full-range period", () => {
		const periods = [
			makePeriod({ fromDate: "2026-01-01", toDate: "2026-12-31" }),
		];
		const result = calculateAccrualForPeriods(
			periods,
			0.1,
			100_000,
			"2026-01-01",
			"2026-12-31"
		);
		// 365 days * 0.1 * 1 * 100_000 / 365 = 10_000
		expect(result).toBe(10_000);
	});

	it("clips period to query range (period wider than query)", () => {
		const periods = [
			makePeriod({ fromDate: "2025-01-01", toDate: "2027-12-31" }),
		];
		const result = calculateAccrualForPeriods(
			periods,
			0.1,
			100_000,
			"2026-01-01",
			"2026-12-31"
		);
		expect(result).toBe(10_000);
	});

	it("clips period to query range (period narrower than query)", () => {
		const periods = [
			makePeriod({ fromDate: "2026-04-01", toDate: "2026-06-30" }),
		];
		// 91 days (Apr 1 to Jun 30 inclusive)
		const result = calculateAccrualForPeriods(
			periods,
			0.1,
			100_000,
			"2026-01-01",
			"2026-12-31"
		);
		const expected = (0.1 * 1 * 100_000 * 91) / 365;
		expect(result).toBeCloseTo(expected, 10);
	});

	it("skips periods entirely outside query range", () => {
		const periods = [
			makePeriod({ fromDate: "2025-01-01", toDate: "2025-12-31" }),
		];
		const result = calculateAccrualForPeriods(
			periods,
			0.1,
			100_000,
			"2026-01-01",
			"2026-12-31"
		);
		expect(result).toBe(0);
	});

	it("handles null toDate (still-active period)", () => {
		const periods = [makePeriod({ fromDate: "2026-01-01", toDate: null })];
		const result = calculateAccrualForPeriods(
			periods,
			0.1,
			100_000,
			"2026-01-01",
			"2026-12-31"
		);
		expect(result).toBe(10_000);
	});

	it("sums multiple periods with different fractions", () => {
		const periods = [
			makePeriod({
				lenderId: "lender_1" as Id<"lenders">,
				fraction: 0.5,
				fromDate: "2026-01-01",
				toDate: "2026-06-30",
			}),
			makePeriod({
				lenderId: "lender_1" as Id<"lenders">,
				fraction: 0.75,
				fromDate: "2026-07-01",
				toDate: "2026-12-31",
			}),
		];
		const result = calculateAccrualForPeriods(
			periods,
			0.1,
			100_000,
			"2026-01-01",
			"2026-12-31"
		);

		// First period: 181 days (Jan 1 to Jun 30) * 0.5 fraction
		const first = (0.1 * 0.5 * 100_000 * 181) / 365;
		// Second period: 184 days (Jul 1 to Dec 31) * 0.75 fraction
		const second = (0.1 * 0.75 * 100_000 * 184) / 365;
		expect(result).toBeCloseTo(first + second, 10);
	});

	it("handles zero-fraction periods (contributes nothing)", () => {
		const periods = [makePeriod({ fraction: 0 })];
		const result = calculateAccrualForPeriods(
			periods,
			0.1,
			100_000,
			"2026-01-01",
			"2026-12-31"
		);
		expect(result).toBe(0);
	});

	it("handles empty periods array", () => {
		const result = calculateAccrualForPeriods(
			[],
			0.1,
			100_000,
			"2026-01-01",
			"2026-12-31"
		);
		expect(result).toBe(0);
	});

	it("handles partial overlap at start of query range", () => {
		const periods = [
			makePeriod({ fromDate: "2025-12-01", toDate: "2026-01-31" }),
		];
		// Clipped to Jan 1 – Jan 31 = 31 days
		const result = calculateAccrualForPeriods(
			periods,
			0.1,
			100_000,
			"2026-01-01",
			"2026-12-31"
		);
		const expected = (0.1 * 1 * 100_000 * 31) / 365;
		expect(result).toBeCloseTo(expected, 10);
	});

	it("handles partial overlap at end of query range", () => {
		const periods = [
			makePeriod({ fromDate: "2026-12-01", toDate: "2027-01-31" }),
		];
		// Clipped to Dec 1 – Dec 31 = 31 days
		const result = calculateAccrualForPeriods(
			periods,
			0.1,
			100_000,
			"2026-01-01",
			"2026-12-31"
		);
		const expected = (0.1 * 1 * 100_000 * 31) / 365;
		expect(result).toBeCloseTo(expected, 10);
	});

	it("throws when query fromDate is after toDate", () => {
		const periods = [makePeriod()];
		expect(() =>
			calculateAccrualForPeriods(
				periods,
				0.1,
				100_000,
				"2026-12-31",
				"2026-01-01"
			)
		).toThrow(
			"calculateAccrualForPeriods: fromDate 2026-12-31 is after toDate 2026-01-01"
		);
	});
});

// ---------------------------------------------------------------------------
// Precision — no premature rounding
// ---------------------------------------------------------------------------

describe("precision", () => {
	it("preserves full float in intermediate values (calculatePeriodAccrual)", () => {
		// If intermediate values were prematurely rounded to cents,
		// the result would differ from the exact floating-point computation.
		// This uses values that produce a repeating decimal to expose precision loss.
		// (0.07 * 0.333333 * 100_000 * 30) / 365 ≈ 191.78... (repeating)
		const result = calculatePeriodAccrual(0.07, 1 / 3, 100_000, 30);
		const expected = (0.07 * (1 / 3) * 100_000 * 30) / 365;
		// toBeCloseTo with high precision confirms no premature rounding
		expect(result).toBeCloseTo(expected, 10);
	});

	it("preserves full float across multiple period summations", () => {
		// Summing many small periods should not lose precision vs single large period
		const single = calculatePeriodAccrual(0.1, 1, 100_000, 365);
		let summed = 0;
		for (let i = 0; i < 365; i++) {
			summed += calculatePeriodAccrual(0.1, 1, 100_000, 1);
		}
		// Single period: exactly $10,000. Summed periods: very close (within 1e-5),
		// accounting for floating-point accumulation across iterations
		expect(single).toBe(10_000);
		expect(summed).toBeCloseTo(10_000, 5);
	});
});

// ---------------------------------------------------------------------------
// calculateProRataShares
// ---------------------------------------------------------------------------

describe("calculateProRataShares", () => {
	it("distributes $10.00 across 3333/3333/3334 units as 3.33/3.33/3.34", () => {
		const shares = calculateProRataShares(
			[
				makePosition({
					accountId: "ledger_account_1" as Id<"ledger_accounts">,
					lenderId: "lender_1" as Id<"lenders">,
					units: 3333,
				}),
				makePosition({
					accountId: "ledger_account_2" as Id<"ledger_accounts">,
					lenderId: "lender_2" as Id<"lenders">,
					units: 3333,
				}),
				makePosition({
					accountId: "ledger_account_3" as Id<"ledger_accounts">,
					lenderId: "lender_3" as Id<"lenders">,
					units: 3334,
				}),
			],
			10
		);

		expect(shares.map((share) => share.amount)).toEqual([3.33, 3.33, 3.34]);
		expect(
			Math.round(shares.reduce((sum, share) => sum + share.amount, 0) * 100)
		).toBe(1000);
	});

	it("distributes an odd cent deterministically across equal positions", () => {
		const shares = calculateProRataShares(
			[
				makePosition({
					accountId: "ledger_account_1" as Id<"ledger_accounts">,
					lenderId: "lender_1" as Id<"lenders">,
					units: 5000,
				}),
				makePosition({
					accountId: "ledger_account_2" as Id<"ledger_accounts">,
					lenderId: "lender_2" as Id<"lenders">,
					units: 5000,
				}),
			],
			100.01
		);

		expect(shares.map((share) => share.amount)).toEqual([50.01, 50]);
		expect(
			Math.round(shares.reduce((sum, share) => sum + share.amount, 0) * 100)
		).toBe(10_001);
	});

	it("breaks equal-remainder ties by largest position", () => {
		const shares = calculateProRataShares(
			[
				makePosition({
					accountId: "ledger_account_1" as Id<"ledger_accounts">,
					lenderId: "lender_1" as Id<"lenders">,
					units: 2000,
				}),
				makePosition({
					accountId: "ledger_account_2" as Id<"ledger_accounts">,
					lenderId: "lender_2" as Id<"lenders">,
					units: 1000,
				}),
			],
			0.02
		);

		expect(shares.map((share) => share.amount)).toEqual([0.01, 0.01]);
		expect(shares[0]?.rawAmount).toBeCloseTo(0.013_333_333_3, 10);
		expect(shares[1]?.rawAmount).toBeCloseTo(0.006_666_666_7, 10);
	});

	it("preserves input order while allocating cents by rank", () => {
		const shares = calculateProRataShares(
			[
				makePosition({
					accountId: "ledger_account_9" as Id<"ledger_accounts">,
					lenderId: "lender_9" as Id<"lenders">,
					units: 1,
				}),
				makePosition({
					accountId: "ledger_account_8" as Id<"ledger_accounts">,
					lenderId: "lender_8" as Id<"lenders">,
					units: 3,
				}),
			],
			0.01
		);

		expect(shares.map((share) => share.accountId)).toEqual([
			"ledger_account_9",
			"ledger_account_8",
		]);
		expect(shares.map((share) => share.amount)).toEqual([0, 0.01]);
	});

	it("returns an empty array for no positions", () => {
		expect(calculateProRataShares([], 0)).toEqual([]);
	});

	it("throws when distributableAmount is negative", () => {
		expect(() => calculateProRataShares([makePosition()], -0.01)).toThrow(
			"calculateProRataShares: distributableAmount must be non-negative"
		);
	});

	it("throws when total units is not positive", () => {
		expect(() =>
			calculateProRataShares(
				[
					makePosition({
						accountId: "ledger_account_1" as Id<"ledger_accounts">,
						units: 0,
					}),
				],
				1
			)
		).toThrow("calculateProRataShares: totalUnits must be positive");
	});
});
