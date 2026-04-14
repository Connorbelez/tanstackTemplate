import { describe, expect, it } from "vitest";
import { hasAnyPermission, hasPermission } from "#/lib/auth";

describe("route auth permission helpers", () => {
	it("treats admin:access as a wildcard permission", () => {
		expect(hasPermission(["admin:access"], "document:review")).toBe(true);
		expect(
			hasAnyPermission(["admin:access"], [
				"underwriter:access",
				"document:review",
			])
		).toBe(true);
	});

	it("can disable the admin wildcard for boundary-sensitive checks", () => {
		expect(
			hasPermission(
				["admin:access"],
				"document:review",
				{ allowAdminOverride: false }
			)
		).toBe(false);
		expect(
			hasAnyPermission(
				["admin:access"],
				["underwriter:access", "document:review"],
				{ allowAdminOverride: false }
			)
		).toBe(false);
	});

	it("still requires exact matches for non-admin permissions", () => {
		expect(hasPermission(["broker:access"], "document:review")).toBe(false);
		expect(
			hasAnyPermission(["broker:access"], [
				"underwriter:access",
				"document:review",
			])
		).toBe(false);
	});
});
