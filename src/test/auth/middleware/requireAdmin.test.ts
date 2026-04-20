import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import { createMockViewer, createTestConvex, seedFromIdentity } from "../helpers";
import { BROKER, EXTERNAL_ORG_ADMIN } from "../identities";

describe("requireAdmin middleware", () => {
	it("allows any admin regardless of org", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, EXTERNAL_ORG_ADMIN);

		const result = await t
			.withIdentity(EXTERNAL_ORG_ADMIN)
			.mutation(api.test.authTestEndpoints.testRequireAdminMutation);

		expect(result).toEqual({ ok: true });
	});

	it("allows admin:access holders even without an admin role", async () => {
		const identity = createMockViewer({
			orgId: "org_admin_access_test",
			permissions: ["admin:access"],
			roles: ["member"],
		});
		const t = createTestConvex();
		await seedFromIdentity(t, identity);

		const result = await t
			.withIdentity(identity)
			.mutation(api.test.authTestEndpoints.testRequireAdminMutation);

		expect(result).toEqual({ ok: true });
	});

	it("rejects non-admin", async () => {
		const t = createTestConvex();
		await seedFromIdentity(t, BROKER);

		await expect(
			t
				.withIdentity(BROKER)
				.mutation(api.test.authTestEndpoints.testRequireAdminMutation)
		).rejects.toThrow("Forbidden: admin role required");
	});
});
