const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseUTCDate(date: string): Date {
	if (!BUSINESS_DATE_RE.test(date)) {
		throw new Error(
			`Business date must use strict YYYY-MM-DD format, received: ${date}`
		);
	}
	const parsed = new Date(`${date}T00:00:00.000Z`);
	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== date
	) {
		throw new Error(`Business date is not a real UTC calendar date: ${date}`);
	}
	return parsed;
}

function formatUTCDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

/**
 * Check if a given YYYY-MM-DD date falls on a business day (Monday–Friday).
 */
export function isBusinessDay(date: string): boolean {
	const day = parseUTCDate(date).getUTCDay();
	return day !== 0 && day !== 6;
}

/**
 * Add N business days to a YYYY-MM-DD date, skipping weekends.
 * If days === 0, returns the same calendar day normalized to a business day
 * (Saturday/Sunday advance to the following Monday).
 * If the start date is a weekend and days > 0, counting begins from the next Monday.
 */
export function addBusinessDays(startDate: string, days: number): string {
	if (days < 0) {
		throw new Error(
			`addBusinessDays: days must be non-negative, received: ${days}`
		);
	}
	if (days === 0) {
		const d = parseUTCDate(startDate);
		const startDay = d.getUTCDay();
		if (startDay === 0) {
			d.setUTCDate(d.getUTCDate() + 1);
		} else if (startDay === 6) {
			d.setUTCDate(d.getUTCDate() + 2);
		}
		return formatUTCDate(d);
	}

	const d = parseUTCDate(startDate);
	let remaining = days;

	// If starting on a weekend, advance to Monday first
	const startDay = d.getUTCDay();
	if (startDay === 0) {
		d.setUTCDate(d.getUTCDate() + 1);
	} else if (startDay === 6) {
		d.setUTCDate(d.getUTCDate() + 2);
	}

	while (remaining > 0) {
		d.setUTCDate(d.getUTCDate() + 1);
		const dayOfWeek = d.getUTCDay();
		if (dayOfWeek !== 0 && dayOfWeek !== 6) {
			remaining--;
		}
	}

	return formatUTCDate(d);
}

/**
 * Count business days from start (inclusive) up to end (exclusive).
 * Returns 0 if start >= end.
 */
export function countBusinessDaysBetween(start: string, end: string): number {
	if (start >= end) {
		return 0;
	}

	const d = parseUTCDate(start);
	const endMs = parseUTCDate(end).getTime();
	let count = 0;

	while (d.getTime() < endMs) {
		const dayOfWeek = d.getUTCDay();
		if (dayOfWeek !== 0 && dayOfWeek !== 6) {
			count++;
		}
		d.setUTCDate(d.getUTCDate() + 1);
	}

	return count;
}
