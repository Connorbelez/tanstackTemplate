const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertValidBusinessDate(date: string): void {
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
}

export function unixMsToBusinessDate(ms: number): string {
	if (!Number.isFinite(ms)) {
		throw new Error(
			`Unix timestamp must be a finite millisecond value, received: ${ms}`
		);
	}

	return new Date(ms).toISOString().slice(0, 10);
}

export function businessDateToUnixMs(date: string): number {
	assertValidBusinessDate(date);
	return new Date(`${date}T00:00:00.000Z`).getTime();
}
