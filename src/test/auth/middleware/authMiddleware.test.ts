import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../convex/constants";
import {
	createMockIdentity,
	createMockViewer,
	createTestConvex,
	seedFromIdentity,
} from "../helpers";
import { BROKER, EXTERNAL_ORG_ADMIN, FAIRLEND_ADMIN } from "../identities";
import { lookupPermissions } from "../permissions";

describe("authMiddleware (whoAmI)", () => {
	it("rejects unauthenticated access", async () => {
		const t = createTestConvex();

		await expect(t.query(api.fluent.whoAmI)).rejects.toThrow(
			"Unauthorized: sign in required"
		);
	});

	it("builds Viewer from JWT claims", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, BROKER);

		const result = await t.withIdentity(BROKER).query(api.fluent.whoAmI);

		expect(result.roles).toContain("broker");
		expect(result.orgId).toBe("org_brokerage_test");
		expect(result.email).toBe("broker@test.fairlend.ca");
		expect(result.firstName).toBe("Test");
		expect(result.lastName).toBe("Broker");
	});

	it("parses roles from JSON string", async () => {
		const identity = createMockViewer({
			roles: ["admin", "broker"],
			permissions: lookupPermissions(["admin", "broker"]),
			orgId: FAIRLEND_STAFF_ORG_ID,
		});
		const t = createTestConvex();
		await seedFromIdentity(t, identity);

		const result = await t.withIdentity(identity).query(api.fluent.whoAmI);

		expect(result.roles).toContain("admin");
		expect(result.roles).toContain("broker");
	});

	it("parses roles from array", async () => {
		const identity = createMockIdentity({
			roles: ["admin", "broker"] as unknown as string,
		});
		const t = createTestConvex();
		await seedFromIdentity(t, identity);

		const result = await t.withIdentity(identity).query(api.fluent.whoAmI);

		expect(result.roles).toContain("admin");
		expect(result.roles).toContain("broker");
	});

	it("handles empty/missing claims", async () => {
		const identity = createMockIdentity({
			roles: JSON.stringify([]),
			permissions: JSON.stringify([]),
		});
		const t = createTestConvex();
		await seedFromIdentity(t, identity);

		const result = await t.withIdentity(identity).query(api.fluent.whoAmI);

		expect(result.roles).toEqual([]);
		expect(result.permissions).toEqual([]);
	});

	it("sets isFairLendAdmin true for FairLend Staff admin", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, FAIRLEND_ADMIN);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.fluent.whoAmI);

		expect(result.isFairLendAdmin).toBe(true);
	});

	it("sets isFairLendAdmin false for external admin", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, EXTERNAL_ORG_ADMIN);

		const result = await t
			.withIdentity(EXTERNAL_ORG_ADMIN)
			.query(api.fluent.whoAmI);

		expect(result.isFairLendAdmin).toBe(false);
	});

	it("sets isFairLendAdmin false for non-admin in FairLend Staff org", async () => {
		const identity = createMockViewer({
			roles: ["broker"],
			permissions: lookupPermissions(["broker"]),
			orgId: FAIRLEND_STAFF_ORG_ID,
		});
		const t = createTestConvex();
		await seedFromIdentity(t, identity);

		const result = await t.withIdentity(identity).query(api.fluent.whoAmI);

		expect(result.isFairLendAdmin).toBe(false);
	});
});
