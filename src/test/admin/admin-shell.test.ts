import { describe, expect, it } from "vitest";
import {
	getAdminNavigationSections,
	isAdminRouteActive,
} from "#/components/admin/shell/entity-registry";
import { canAccessAdminPath } from "#/lib/auth";
import { isAdminPathname } from "#/lib/admin-routes";

describe("admin shell helpers", () => {
	it("matches dashboard routes exactly instead of every admin page", () => {
		expect(isAdminRouteActive("/admin", "/admin")).toBe(true);
		expect(isAdminRouteActive("/admin/mortgages", "/admin")).toBe(false);
	});

	it("matches entity routes for nested detail pages", () => {
		expect(isAdminRouteActive("/admin/mortgages", "/admin/mortgages")).toBe(true);
		expect(
			isAdminRouteActive("/admin/mortgages/123", "/admin/mortgages")
		).toBe(true);
		expect(isAdminRouteActive("/admin/listings", "/admin/mortgages")).toBe(
			false
		);
	});

	it("builds ordered admin navigation sections and excludes hidden entities", () => {
		const sections = getAdminNavigationSections(
			[
				{
					domain: "system",
					entityType: "zebra",
					iconName: "shield",
					isHiddenFromNavigation: true,
					pluralLabel: "Zebras",
					route: "/admin/zebras",
					singularLabel: "Zebra",
					supportsDetailPage: true,
					supportsTableView: true,
				},
				{
					domain: "system",
					entityType: "borrowers",
					iconName: "user",
					pluralLabel: "Borrowers",
					route: "/admin/borrowers",
					singularLabel: "Borrower",
					supportsDetailPage: true,
					supportsTableView: true,
				},
				{
					domain: "marketplace",
					entityType: "listings",
					iconName: "box",
					pluralLabel: "Listings",
					route: "/admin/listings",
					singularLabel: "Listing",
					supportsDetailPage: true,
					supportsTableView: true,
				},
			],
			[
				{
					domain: "system",
					iconName: "shield",
					kind: "route",
					label: "Dashboard",
					route: "/admin",
				},
			]
		);

		expect(sections.map((section) => section.domain)).toEqual([
			"marketplace",
			"system",
		]);
		expect(sections[1]?.items.map((item) => item.label)).toEqual([
			"Dashboard",
			"Borrowers",
		]);
	});

	it("allows underwriters only on the underwriting admin subtree", () => {
		expect(canAccessAdminPath("/admin/underwriting", ["underwriter:access"])).toBe(
			true
		);
		expect(
			canAccessAdminPath("/admin/underwriting/queue", ["underwriter:access"])
		).toBe(true);
		expect(canAccessAdminPath("/admin/mortgages", ["underwriter:access"])).toBe(
			false
		);
		expect(canAccessAdminPath("/admin/mortgages", ["admin:access"])).toBe(true);
	});

	it("identifies admin pathnames for root header suppression", () => {
		expect(isAdminPathname("/admin")).toBe(true);
		expect(isAdminPathname("/admin/listings")).toBe(true);
		expect(isAdminPathname("/administrator")).toBe(false);
		expect(isAdminPathname("/about")).toBe(false);
	});
});
