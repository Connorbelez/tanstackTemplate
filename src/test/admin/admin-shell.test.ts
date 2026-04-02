import { describe, expect, it } from "vitest";
import { isAdminRouteActive } from "#/components/admin/shell/entity-registry";
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

	it("identifies admin pathnames for root header suppression", () => {
		expect(isAdminPathname("/admin")).toBe(true);
		expect(isAdminPathname("/admin/listings")).toBe(true);
		expect(isAdminPathname("/administrator")).toBe(false);
		expect(isAdminPathname("/about")).toBe(false);
	});
});
