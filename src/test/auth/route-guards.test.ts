import { describe, expect, it } from "vitest";
import {
	canAccessAdminPath,
	canAccessRoute,
	hasAnyPermission,
	hasPermission,
} from "#/lib/auth";

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

	it("evaluates registered product routes through the shared registry", () => {
		expect(
			canAccessRoute("broker", {
				orgId: "org_broker",
				permissions: ["broker:access"],
				role: "broker",
				roles: ["broker"],
			})
		).toBe(true);

		expect(
			canAccessRoute("adminDocumentEngine", {
				orgId: "org_broker",
				permissions: ["document:review"],
				role: "broker",
				roles: ["broker"],
			})
		).toBe(false);
	});

	it("keeps admin subtree access declarative by path registry", () => {
		expect(
			canAccessAdminPath("/admin/originations/case_123", {
				orgId: "org_ops",
				permissions: ["mortgage:originate"],
				role: "member",
				roles: ["member"],
			})
		).toBe(true);

		expect(
			canAccessAdminPath("/admin/rotessa-reconciliation", {
				orgId: "org_ops",
				permissions: ["mortgage:originate"],
				role: "member",
				roles: ["member"],
			})
		).toBe(false);
	});
});
