import { describe, expect, it } from "vitest";
import { parseAdminDetailSearch } from "#/lib/admin-detail-search";

describe("parseAdminDetailSearch", () => {
	it("parses truthy detailOpen variants", () => {
		expect(parseAdminDetailSearch({ detailOpen: true }).detailOpen).toBe(true);
		expect(parseAdminDetailSearch({ detailOpen: "true" }).detailOpen).toBe(
			true
		);
		expect(parseAdminDetailSearch({ detailOpen: "1" }).detailOpen).toBe(true);
		expect(parseAdminDetailSearch({ detailOpen: "yes" }).detailOpen).toBe(
			true
		);
	});

	it("normalizes quoted and numeric record IDs", () => {
		expect(parseAdminDetailSearch({ recordId: '"mortgage_123"' }).recordId).toBe(
			"mortgage_123"
		);
		expect(parseAdminDetailSearch({ recordId: '"42"' }).recordId).toBe("42");
		expect(parseAdminDetailSearch({ recordId: 42 }).recordId).toBe("42");
	});

	it("treats empty or unsupported record IDs as undefined", () => {
		expect(parseAdminDetailSearch({ recordId: "" }).recordId).toBeUndefined();
		expect(parseAdminDetailSearch({ recordId: "   " }).recordId).toBeUndefined();
		expect(parseAdminDetailSearch({ recordId: null }).recordId).toBeUndefined();
	});

	it("preserves entityType and defaults malformed booleans to false", () => {
		expect(
			parseAdminDetailSearch({
				detailOpen: "not-true",
				entityType: "mortgages",
				recordId: '"abc123"',
			})
		).toEqual({
			detailOpen: false,
			entityType: "mortgages",
			recordId: "abc123",
		});
	});
});
