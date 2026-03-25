import { describe, expect, it } from "vitest";
import {
	addBusinessDays,
	countBusinessDaysBetween,
	isBusinessDay,
} from "../businessDays";

describe("isBusinessDay", () => {
	it("returns true for Monday through Friday", () => {
		expect(isBusinessDay("2026-03-23")).toBe(true); // Monday
		expect(isBusinessDay("2026-03-24")).toBe(true); // Tuesday
		expect(isBusinessDay("2026-03-25")).toBe(true); // Wednesday
		expect(isBusinessDay("2026-03-26")).toBe(true); // Thursday
		expect(isBusinessDay("2026-03-27")).toBe(true); // Friday
	});

	it("returns false for Saturday and Sunday", () => {
		expect(isBusinessDay("2026-03-28")).toBe(false); // Saturday
		expect(isBusinessDay("2026-03-29")).toBe(false); // Sunday
	});
});

describe("addBusinessDays", () => {
	it("returns same date for 0 business days", () => {
		expect(addBusinessDays("2026-03-25", 0)).toBe("2026-03-25");
	});

	it("returns same date for 0 days even on weekend", () => {
		expect(addBusinessDays("2026-03-28", 0)).toBe("2026-03-28"); // Saturday
		expect(addBusinessDays("2026-03-29", 0)).toBe("2026-03-29"); // Sunday
	});

	it("Monday + 1 = Tuesday", () => {
		expect(addBusinessDays("2026-03-23", 1)).toBe("2026-03-24");
	});

	it("Friday + 1 = next Monday", () => {
		expect(addBusinessDays("2026-03-27", 1)).toBe("2026-03-30");
	});

	it("Friday + 5 = next Friday", () => {
		expect(addBusinessDays("2026-03-27", 5)).toBe("2026-04-03");
	});

	it("Saturday + 1 = Tuesday (advances to Monday first, then +1)", () => {
		expect(addBusinessDays("2026-03-28", 1)).toBe("2026-03-31");
	});

	it("Sunday + 1 = Tuesday (advances to Monday first, then +1)", () => {
		expect(addBusinessDays("2026-03-29", 1)).toBe("2026-03-31");
	});

	it("handles crossing a month boundary", () => {
		// Thursday March 26 + 5 bd = Thursday April 2
		expect(addBusinessDays("2026-03-26", 5)).toBe("2026-04-02");
	});

	it("handles December crossing into January", () => {
		// Dec 30 (Wed) + 5 bd: Thu(1), Fri(2), Sat/Sun skip, Mon(3), Tue(4), Wed(5) = Jan 6
		expect(addBusinessDays("2026-12-30", 5)).toBe("2027-01-06");
	});

	it("throws for negative days", () => {
		expect(() => addBusinessDays("2026-03-25", -1)).toThrow(
			"days must be non-negative"
		);
	});

	it("throws for invalid date format", () => {
		expect(() => addBusinessDays("not-a-date", 1)).toThrow("strict YYYY-MM-DD");
	});
});

describe("countBusinessDaysBetween", () => {
	it("returns 0 when start >= end", () => {
		expect(countBusinessDaysBetween("2026-03-25", "2026-03-25")).toBe(0);
		expect(countBusinessDaysBetween("2026-03-26", "2026-03-25")).toBe(0);
	});

	it("counts Monday and Tuesday from Monday to Wednesday", () => {
		// Monday (inclusive) to Wednesday (exclusive) = Mon, Tue = 2
		expect(countBusinessDaysBetween("2026-03-23", "2026-03-25")).toBe(2);
	});

	it("counts 5 business days for a full work week", () => {
		// Monday to next Monday (exclusive) = 5 business days
		expect(countBusinessDaysBetween("2026-03-23", "2026-03-30")).toBe(5);
	});

	it("counts Friday but excludes weekends", () => {
		// Friday (inclusive) to Monday (exclusive) = 1 business day (Friday)
		expect(countBusinessDaysBetween("2026-03-27", "2026-03-30")).toBe(1);
	});
});
