import { describe, expect, it } from "vitest";
import { resolveAdminDetailSheetState } from "#/hooks/useAdminDetailSheet";
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

	it("parses metadata-fallback entity routes without the static admin registry", () => {
		expect(getAdminDetailRouteState("/admin/lead/lead_123")).toEqual({
			detailOpen: true,
			entityType: "lead",
			recordId: "lead_123",
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
		expect(getAdminDetailRouteState("/admin/underwriting/request_1")).toEqual({
			detailOpen: false,
			entityType: undefined,
			recordId: undefined,
		});
	});
});

describe("resolveAdminDetailSheetState", () => {
	it("keeps the sheet closed on direct admin detail pages", () => {
		expect(
			resolveAdminDetailSheetState({
				current: undefined,
				isOpen: false,
				pathname: "/admin/borrowers/borrower_123",
			})
		).toEqual({
			detailOpen: false,
			entityType: "borrowers",
			recordId: "borrower_123",
		});
	});

	it("prefers explicit sidebar state over route-derived state", () => {
		expect(
			resolveAdminDetailSheetState({
				current: {
					entityType: "mortgages",
					recordId: "mtg_456",
				},
				isOpen: true,
				pathname: "/admin/borrowers/borrower_123",
			})
		).toEqual({
			detailOpen: true,
			entityType: "mortgages",
			recordId: "mtg_456",
		});
	});
});
