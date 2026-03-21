import { describe, expect, it } from "vitest";
import { businessDateToUnixMs, unixMsToBusinessDate } from "../businessDates";

const STRICT_FORMAT_RE = /strict YYYY-MM-DD format/;
const REAL_DATE_RE = /not a real UTC calendar date/;

describe("businessDates", () => {
	it("round-trips a valid business date at UTC midnight", () => {
		const timestamp = businessDateToUnixMs("2026-03-15");

		expect(timestamp).toBe(Date.UTC(2026, 2, 15, 0, 0, 0, 0));
		expect(unixMsToBusinessDate(timestamp)).toBe("2026-03-15");
	});

	it("rejects invalid business date formats", () => {
		expect(() => businessDateToUnixMs("2026-3-15")).toThrow(STRICT_FORMAT_RE);
		expect(() => businessDateToUnixMs("03-15-2026")).toThrow(STRICT_FORMAT_RE);
	});

	it("rejects impossible UTC calendar dates", () => {
		expect(() => businessDateToUnixMs("2026-02-30")).toThrow(REAL_DATE_RE);
	});

	it("formats timestamps in UTC without local-time drift", () => {
		const eveningInToronto = Date.UTC(2026, 2, 15, 23, 59, 59, 999);

		expect(unixMsToBusinessDate(eveningInToronto)).toBe("2026-03-15");
		expect(unixMsToBusinessDate(eveningInToronto + 1)).toBe("2026-03-16");
	});
});
