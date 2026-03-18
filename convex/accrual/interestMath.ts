import type { OwnershipPeriod } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

// ---------------------------------------------------------------------------
// Date helpers — all inputs/outputs are YYYY-MM-DD strings, UTC-safe
// ---------------------------------------------------------------------------

/**
 * Returns the number of calendar days from `fromDate` to `toDate`, inclusive
 * of both endpoints (Actual/365 day-count convention).
 *
 * `daysBetween("2026-01-15", "2026-01-15")` === 1
 */
export function daysBetween(fromDate: string, toDate: string): number {
	const from = Date.parse(`${fromDate}T00:00:00Z`);
	const to = Date.parse(`${toDate}T00:00:00Z`);
	const days = Math.floor((to - from) / MS_PER_DAY) + 1;
	if (days < 1) {
		throw new Error(
			`daysBetween: fromDate ${fromDate} is after toDate ${toDate}`
		);
	}
	return days;
}

/**
 * Returns the date string for the day after the given date.
 */
export function dayAfter(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

/**
 * Returns the date string for the day before the given date.
 */
export function dayBefore(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

/**
 * Returns the later of two YYYY-MM-DD date strings.
 */
export function maxDate(a: string, b: string): string {
	return a >= b ? a : b;
}

/**
 * Returns the earlier of two YYYY-MM-DD date strings.
 */
export function minDate(a: string, b: string): string {
	return a <= b ? a : b;
}

// ---------------------------------------------------------------------------
// Interest calculations — Actual/365, full floating-point precision
// ---------------------------------------------------------------------------

/**
 * Calculates accrued interest for a single ownership period.
 *
 * Formula: annualRate * fraction * principalBalance * days / 365
 *
 * No rounding is applied — that is deferred to the presentation layer.
 */
export function calculatePeriodAccrual(
	annualRate: number,
	fraction: number,
	principalBalance: number,
	days: number
): number {
	return (annualRate * fraction * principalBalance * days) / DAYS_PER_YEAR;
}

/**
 * Calculates total accrued interest across multiple ownership periods,
 * clipping each period to the query date range [fromDate, toDate].
 *
 * Periods that fall entirely outside the query range are skipped.
 * Periods with toDate === null are treated as extending through `toDate`.
 */
export function calculateAccrualForPeriods(
	periods: OwnershipPeriod[],
	annualRate: number,
	principalBalance: number,
	fromDate: string,
	toDate: string
): number {
	let total = 0;

	for (const period of periods) {
		const effectiveFrom = maxDate(period.fromDate, fromDate);
		const effectiveTo = minDate(period.toDate ?? toDate, toDate);

		// Skip periods that don't overlap with the query range
		if (effectiveFrom > effectiveTo) {
			continue;
		}

		const days = daysBetween(effectiveFrom, effectiveTo);
		total += calculatePeriodAccrual(
			annualRate,
			period.fraction,
			principalBalance,
			days
		);
	}

	return total;
}
