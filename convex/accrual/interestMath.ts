import type { OwnershipPeriod, PositionShare, ProRataPosition } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;
const CENTS_PER_DOLLAR = 100;

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
	if (Number.isNaN(from) || Number.isNaN(to)) {
		throw new Error(
			`daysBetween: invalid date string (from=${fromDate}, to=${toDate})`
		);
	}
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
	if (fromDate > toDate) {
		throw new Error(
			`calculateAccrualForPeriods: fromDate ${fromDate} is after toDate ${toDate}`
		);
	}

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

type WorkingPositionShare = PositionShare & {
	flooredCents: number;
	originalIndex: number;
	remainder: number;
};

/**
 * Splits a distributable amount across positions using the largest-remainder
 * method so the rounded output sums exactly to the original amount.
 */
export function calculateProRataShares(
	positions: ProRataPosition[],
	distributableAmount: number
): PositionShare[] {
	if (distributableAmount < 0) {
		throw new Error(
			`calculateProRataShares: distributableAmount must be non-negative (received ${distributableAmount})`
		);
	}

	if (positions.length === 0) {
		return [];
	}

	const totalUnits = positions.reduce(
		(sum, position) => sum + position.units,
		0
	);
	if (totalUnits <= 0) {
		throw new Error(
			`calculateProRataShares: totalUnits must be positive (received ${totalUnits})`
		);
	}

	const workingShares: WorkingPositionShare[] = positions.map(
		(position, originalIndex) => {
			const rawAmount = (position.units / totalUnits) * distributableAmount;
			const rawCents = rawAmount * CENTS_PER_DOLLAR;
			const flooredCents = Math.floor(rawCents);

			return {
				...position,
				amount: flooredCents / CENTS_PER_DOLLAR,
				flooredCents,
				originalIndex,
				rawAmount,
				remainder: rawCents - flooredCents,
			};
		}
	);

	const distributableCents = Math.round(distributableAmount * CENTS_PER_DOLLAR);
	const flooredCents = workingShares.reduce(
		(sum, share) => sum + share.flooredCents,
		0
	);
	let remainingCents = distributableCents - flooredCents;

	const rankedShares = [...workingShares].sort((a, b) => {
		if (Math.abs(b.remainder - a.remainder) > Number.EPSILON) {
			return b.remainder - a.remainder;
		}
		if (b.units !== a.units) {
			return b.units - a.units;
		}
		return a.originalIndex - b.originalIndex;
	});

	for (
		let index = 0;
		index < rankedShares.length && remainingCents > 0;
		index += 1
	) {
		rankedShares[index].flooredCents += 1;
		remainingCents -= 1;
	}

	return workingShares.map(
		({
			flooredCents: allocatedCents,
			originalIndex: _,
			remainder: __,
			...share
		}) => ({
			...share,
			amount: allocatedCents / CENTS_PER_DOLLAR,
		})
	);
}
