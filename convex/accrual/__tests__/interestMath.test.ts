import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
	calculateAccrualForPeriods,
	calculatePeriodAccrual,
	dayAfter,
	dayBefore,
	daysBetween,
	maxDate,
	minDate,
} from "../interestMath";
import type { OwnershipPeriod } from "../types";

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
});
