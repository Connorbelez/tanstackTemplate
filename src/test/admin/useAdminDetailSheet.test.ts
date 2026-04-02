import { describe, expect, it } from "vitest";
import { getAdminDetailRouteState } from "#/lib/admin-detail-route-state";

describe("getAdminDetailRouteState", () => {
	it("returns entity and record details for direct admin record routes", () => {
		expect(getAdminDetailRouteState("/admin/mortgages/mtg_123")).toEqual({
			detailOpen: true,
			entityType: "mortgages",
			recordId: "mtg_123",
		});
	});

	it("decodes encoded record ids from the pathname", () => {
		expect(getAdminDetailRouteState("/admin/properties/property%2Fabc")).toEqual({
			detailOpen: true,
			entityType: "properties",
			recordId: "property/abc",
		});
	});

	it("keeps entity list routes closed", () => {
		expect(getAdminDetailRouteState("/admin/listings")).toEqual({
			detailOpen: false,
			entityType: "listings",
			recordId: undefined,
		});
	});

	it("ignores non-entity admin routes", () => {
		expect(getAdminDetailRouteState("/admin/underwriting")).toEqual({
			detailOpen: false,
			entityType: undefined,
			recordId: undefined,
		});
	});
});
