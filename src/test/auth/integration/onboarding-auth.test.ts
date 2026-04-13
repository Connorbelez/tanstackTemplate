/**
 * T-015: Onboarding auth integration tests.
 *
 * Verifies that onboarding mutations enforce the correct auth chains
 * using the shared identity fixtures instead of inline identities.
 *
 * - requestRole: authedMutation + requirePermission("onboarding:access")
 * - getMyOnboardingRequest: authedQuery + requirePermission("onboarding:access")
 * - approveRequest: adminMutation + requirePermission("onboarding:review")
 * - rejectRequest: adminMutation + requirePermission("onboarding:review")
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../convex/_generated/api";
import { setWorkosProvisioningForTests } from "../../../../convex/engine/effects/workosProvisioning";
import { drainScheduledWork } from "../../convex/onboarding/helpers";
import { createTestConvex, seedFromIdentity } from "../helpers";
import {
	BROKER,
	EXTERNAL_ORG_ADMIN,
	FAIRLEND_ADMIN,
	MEMBER,
	UNDERWRITER,
} from "../identities";

function createProvisioningSuccessMock() {
	return {
		createOrganization: vi
			.fn()
			.mockResolvedValue({ id: "org_provisioned_test" }),
		createOrganizationMembership: vi.fn().mockResolvedValue({}),
	};
}

describe("onboarding auth integration", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		setWorkosProvisioningForTests(null);
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

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

		it("rejects authenticated users without onboarding:access", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, UNDERWRITER);

			await expect(
				t.withIdentity(UNDERWRITER).mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "broker",
					referralSource: "self_signup",
				})
			).rejects.toThrow('Forbidden: permission "onboarding:access" required');
		});
	});

	describe("getMyOnboardingRequest", () => {
		it("returns the member's own onboarding requests", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			await t.withIdentity(MEMBER).mutation(api.onboarding.mutations.requestRole, {
				requestedRole: "broker",
				referralSource: "self_signup",
			});

			const requests = await t
				.withIdentity(MEMBER)
				.query(api.onboarding.queries.getMyOnboardingRequest);

			expect(requests).toHaveLength(1);
			expect(requests?.[0]?.requestedRole).toBe("broker");
		});

		it("rejects authenticated users without onboarding:access", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, UNDERWRITER);

			await expect(
				t
					.withIdentity(UNDERWRITER)
					.query(api.onboarding.queries.getMyOnboardingRequest)
			).rejects.toThrow('Forbidden: permission "onboarding:access" required');
		});
	});

	describe("approveRequest", () => {
		it("accepts FairLend admin", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);
			setWorkosProvisioningForTests(createProvisioningSuccessMock());

			const requestId = await t
				.withIdentity(MEMBER)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "broker",
					referralSource: "self_signup",
				});

			const result = await t
				.withIdentity(FAIRLEND_ADMIN)
				.mutation(api.onboarding.mutations.approveRequest, { requestId });
			await drainScheduledWork(t);

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
			).rejects.toThrow("Forbidden: fair lend admin role required");
		});

		it("rejects external org admin (not a FairLend admin)", async () => {
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
			).rejects.toThrow("Forbidden: fair lend admin role required");
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
			).rejects.toThrow("Forbidden: fair lend admin role required");
		});
	});
});
