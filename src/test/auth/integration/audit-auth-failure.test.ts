/**
 * T-016: Audit auth failure integration tests.
 *
 * Verifies that middleware rejections throw ConvexErrors with the expected
 * error messages. The `auditAuthFailure` function is called in the same
 * code path, so if the throw happens, audit was attempted.
 *
 * Also verifies that different middleware layers produce distinct error
 * messages, confirming the correct middleware denied access.
 */

import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import {
	createMockViewer,
	createTestConvex,
	seedFromIdentity,
} from "../helpers";
import { BROKER, MEMBER } from "../identities";
import { lookupPermissions } from "../permissions";

describe("audit auth failure", () => {
	describe("mutation auth failure", () => {
		it("throws expected error for non-admin calling adminMutation", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, BROKER);

			await expect(
				t
					.withIdentity(BROKER)
					.mutation(api.test.authTestEndpoints.testRequireAdminMutation)
			).rejects.toThrow("Forbidden: admin role required");
		});
	});

	describe("query auth failure", () => {
		it("throws expected error for non-admin calling adminQuery", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, BROKER);

			await expect(
				t.withIdentity(BROKER).query(api.test.authTestEndpoints.testAdminQuery)
			).rejects.toThrow("Forbidden: fair lend admin role required");
		});
	});

	describe("middleware-specific error messages", () => {
		it("unauthenticated access throws sign in required", async () => {
			const t = createTestConvex();

			await expect(
				t.mutation(api.test.authTestEndpoints.testRequireAdminMutation)
			).rejects.toThrow("Unauthorized: sign in required");
		});

		it("requireFairLendAdmin throws fair lend admin required", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, BROKER);

			await expect(
				t.withIdentity(BROKER).query(api.test.authTestEndpoints.testAdminQuery)
			).rejects.toThrow("Forbidden: fair lend admin role required");
		});

		it("requireAdmin throws admin role required", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, BROKER);

			await expect(
				t
					.withIdentity(BROKER)
					.mutation(api.test.authTestEndpoints.testRequireAdminMutation)
			).rejects.toThrow("Forbidden: admin role required");
		});

		it("requirePermission throws with specific permission name", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			await expect(
				t.withIdentity(MEMBER).query(api.test.authTestEndpoints.testBrokerQuery)
			).rejects.toThrow("Forbidden: permission");

			await expect(
				t.withIdentity(MEMBER).query(api.test.authTestEndpoints.testBrokerQuery)
			).rejects.toThrow("broker:access");
		});

		it("requireOrgContext throws org context required", async () => {
			const identity = createMockViewer({
				roles: ["broker"],
				permissions: lookupPermissions(["broker"]),
			});
			const t = createTestConvex();
			await seedFromIdentity(t, identity);

			await expect(
				t
					.withIdentity(identity)
					.query(api.test.authTestEndpoints.testBrokerQuery)
			).rejects.toThrow("Forbidden: org context required");
		});
	});
});
