import type { OwnershipPeriod, PositionShare, ProRataPosition } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;
const _CENTS_PER_DOLLAR = 100;
// Kept as a documented constant for cent/dollar conversions; intentionally unused in this module.
void _CENTS_PER_DOLLAR;

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

/**
 * Calculates per-lender shares for a distributable amount using the
 * largest-remainder method.
 *
 * Inputs and outputs are in dollars. `units` are ledger ownership units out of
 * 10_000. The returned `amount` values are in dollars and sum exactly to the
 * distributable amount.
 */
export function calculateProRataShares(
	positions: ProRataPosition[],
	distributableAmount: number
): PositionShare[] {
	if (!Number.isSafeInteger(distributableAmount) || distributableAmount < 0) {
		throw new Error(
			`calculateProRataShares: distributableAmount must be a non-negative integer cent value, got ${distributableAmount}`
		);
	}

	if (positions.length === 0) {
		return [];
	}

	const totalUnits = positions.reduce(
		(sum, position) => sum + position.units,
		0
	);

	if (!Number.isSafeInteger(totalUnits) || totalUnits <= 0) {
		return [];
	}

	const withRemainders = positions.map((position, index) => {
		const rawAmount = (distributableAmount * position.units) / totalUnits;
		const amount = Math.floor(rawAmount + 1e-9);
		return {
			...position,
			index,
			rawAmount,
			amount,
			remainder: rawAmount - amount,
		};
	});

	let remainingCents =
		distributableAmount -
		withRemainders.reduce((sum, position) => sum + position.amount, 0);

	withRemainders.sort((left, right) => {
		const remainderDiff = right.remainder - left.remainder;
		if (Math.abs(remainderDiff) > 1e-12) {
			return remainderDiff;
		}
		const unitDiff = right.units - left.units;
		if (unitDiff !== 0) {
			return unitDiff;
		}
		return left.index - right.index;
	});

	for (const share of withRemainders) {
		if (remainingCents <= 0) {
			break;
		}
		share.amount += 1;
		remainingCents -= 1;
	}

	return withRemainders
		.sort((left, right) => left.index - right.index)
		.map(({ index: _index, remainder: _remainder, ...share }) => ({
			amount: share.amount,
			lenderAccountId: share.lenderAccountId,
			lenderId: share.lenderId,
			rawAmount: share.rawAmount,
			units: share.units,
		}));
}
