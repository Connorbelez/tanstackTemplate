/**
 * T-015: Onboarding auth integration tests.
 *
 * Verifies that onboarding mutations enforce the correct auth chains
 * using the shared identity fixtures instead of inline identities.
 *
 * - requestRole: authedMutation (any authenticated user)
 * - approveRequest: adminMutation + requirePermission("onboarding:review")
 * - rejectRequest: adminMutation + requirePermission("onboarding:review")
 */

import { describe, expect, it } from "vitest";
import { api } from "../../../../convex/_generated/api";
import { createTestConvex, seedFromIdentity } from "../helpers";
import {
	BROKER,
	EXTERNAL_ORG_ADMIN,
	FAIRLEND_ADMIN,
	MEMBER,
} from "../identities";

describe("onboarding auth integration", () => {
	describe("requestRole", () => {
		it("accepts member with onboarding:access", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const requestId = await t
				.withIdentity(MEMBER)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "broker",
					referralSource: "self_signup",
				});

			expect(requestId).toBeDefined();
		});

		it("rejects unauthenticated", async () => {
			const t = createTestConvex();

			await expect(
				t.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "broker",
					referralSource: "self_signup",
				})
			).rejects.toThrow("Unauthorized: sign in required");
		});
	});

	describe("approveRequest", () => {
		it("accepts FairLend admin", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const requestId = await t
				.withIdentity(MEMBER)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "broker",
					referralSource: "self_signup",
				});

			const result = await t
				.withIdentity(FAIRLEND_ADMIN)
				.mutation(api.onboarding.mutations.approveRequest, { requestId });

			expect(result.success).toBe(true);
		});

		it("rejects broker (no admin role)", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, BROKER);

			const requestId = await t
				.withIdentity(MEMBER)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "broker",
					referralSource: "self_signup",
				});

			await expect(
				t
					.withIdentity(BROKER)
					.mutation(api.onboarding.mutations.approveRequest, { requestId })
			).rejects.toThrow("Forbidden: admin role required");
		});

		it("rejects external org admin (missing onboarding:review)", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, EXTERNAL_ORG_ADMIN);

			const requestId = await t
				.withIdentity(MEMBER)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "broker",
					referralSource: "self_signup",
				});

			await expect(
				t
					.withIdentity(EXTERNAL_ORG_ADMIN)
					.mutation(api.onboarding.mutations.approveRequest, { requestId })
			).rejects.toThrow('Forbidden: permission "onboarding:review" required');
		});
	});

	describe("rejectRequest", () => {
		it("accepts FairLend admin", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const requestId = await t
				.withIdentity(MEMBER)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "broker",
					referralSource: "self_signup",
				});

			const result = await t
				.withIdentity(FAIRLEND_ADMIN)
				.mutation(api.onboarding.mutations.rejectRequest, {
					requestId,
					rejectionReason: "test rejection",
				});

			expect(result.success).toBe(true);
		});

		it("rejects broker (no admin role)", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, BROKER);

			const requestId = await t
				.withIdentity(MEMBER)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "broker",
					referralSource: "self_signup",
				});

			await expect(
				t
					.withIdentity(BROKER)
					.mutation(api.onboarding.mutations.rejectRequest, {
						requestId,
						rejectionReason: "test rejection",
					})
			).rejects.toThrow("Forbidden: admin role required");
		});
	});
});
