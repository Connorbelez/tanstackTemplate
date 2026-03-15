import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../convex/constants";
import {
	createMockViewer,
	createTestConvex,
	seedFromIdentity,
} from "../helpers";
import { EXTERNAL_ORG_ADMIN, FAIRLEND_ADMIN } from "../identities";

describe("requireFairLendAdmin middleware", () => {
	it("allows FairLend Staff admin", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, FAIRLEND_ADMIN);

		const result = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.test.authTestEndpoints.testAdminQuery);

		expect(result).toEqual({ ok: true });
	});

	it("rejects external org admin", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, EXTERNAL_ORG_ADMIN);

		await expect(
			t
				.withIdentity(EXTERNAL_ORG_ADMIN)
				.query(api.test.authTestEndpoints.testAdminQuery)
		).rejects.toThrow("Forbidden: fair lend admin role required");
	});

	it("rejects non-admin with FairLend Staff org", async () => {
		const identity = createMockViewer({
			roles: ["broker"],
			orgId: FAIRLEND_STAFF_ORG_ID,
		});
		const t = createTestConvex();
		await seedFromIdentity(t, identity);

		await expect(
			t.withIdentity(identity).query(api.test.authTestEndpoints.testAdminQuery)
		).rejects.toThrow("Forbidden: fair lend admin role required");
	});

	it("rejects admin with no org context", async () => {
		const identity = createMockViewer({
			roles: ["admin"],
		});
		const t = createTestConvex();
		await seedFromIdentity(t, identity);

		await expect(
			t.withIdentity(identity).query(api.test.authTestEndpoints.testAdminQuery)
		).rejects.toThrow("Forbidden: fair lend admin role required");
	});
});
