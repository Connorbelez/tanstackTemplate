import { describe, expect, it } from "vitest";
import { FAIRLEND_STAFF_ORG_ID } from "../../../convex/constants";
import {
	hasAnyEffectivePermission,
	hasEffectivePermission,
	isFairLendStaffAdmin,
	normalizeRoles,
} from "#/lib/auth-policy";

describe("auth policy", () => {
	it("merges singular role claims into the normalized role list", () => {
		expect(
			normalizeRoles({
				role: "admin",
				roles: JSON.stringify([]),
			})
		).toEqual(["admin"]);
	});

	it("recognizes a FairLend staff admin from a singular role claim", () => {
		expect(
			isFairLendStaffAdmin({
				orgId: FAIRLEND_STAFF_ORG_ID,
				role: "admin",
				roles: JSON.stringify([]),
			})
		).toBe(true);
	});

	it("grants effective permission overrides to FairLend staff admins", () => {
		expect(
			hasEffectivePermission(
				{
					orgId: FAIRLEND_STAFF_ORG_ID,
					permissions: ["admin:access"],
					role: "admin",
					roles: JSON.stringify([]),
				},
				"payment:view"
			)
		).toBe(true);
		expect(
			hasAnyEffectivePermission(
				{
					orgId: FAIRLEND_STAFF_ORG_ID,
					permissions: ["admin:access"],
					role: "admin",
					roles: JSON.stringify([]),
				},
				["cash_ledger:view", "payment:view"]
			)
		).toBe(true);
	});

	it("does not grant external org admins implicit permission overrides", () => {
		expect(
			hasEffectivePermission(
				{
					orgId: "org_external_test",
					permissions: ["admin:access"],
					role: "admin",
					roles: JSON.stringify([]),
				},
				"payment:view"
			)
		).toBe(false);
	});
});
