import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../convex/_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../convex/constants";
import { setWorkosProvisioningForTests } from "../../../../convex/engine/effects/workosProvisioning";
import { createMockViewer } from "../../auth/helpers";
import { BROKER, FAIRLEND_ADMIN, MEMBER } from "../../auth/identities";
import {
	approveRequest,
	createGovernedTestConvex,
	createSelfSignupRequest,
	drainScheduledWork,
	getRequest,
	getRequestAuditHistory,
	seedBrokerMembership,
	seedDefaultGovernedActors,
} from "./helpers";

interface AuditHistoryEvent {
	action?: string;
}

function createProvisioningSuccessMock() {
	return {
		createOrganization: vi
			.fn()
			.mockResolvedValue({ id: "org_provisioned_test" }),
		createOrganizationMembership: vi.fn().mockResolvedValue({}),
		createUser: vi
			.fn()
			.mockResolvedValue({ email: "provisioned@test.fairlend.ca", id: "user_new" }),
		listUsers: vi.fn().mockResolvedValue([]),
	};
}

describe("onboarding integration coverage", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		setWorkosProvisioningForTests(null);
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it.each([
		"admin",
		"jr_underwriter",
		"underwriter",
	] as const)("assigns FairLend Staff org for %s self-signup requests", async (requestedRole) => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const requestId = await createSelfSignupRequest(t, requestedRole);
		const request = await getRequest(t, requestId);

		expect(request?.targetOrganizationId).toBe(FAIRLEND_STAFF_ORG_ID);
	});

	it("fails request creation when the caller has no matching user row", async () => {
		const t = createGovernedTestConvex();
		const unseededMember = createMockViewer({
			roles: ["member"],
			subject: "user_member_unseeded",
		});

		await expect(
			t
				.withIdentity(unseededMember)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "lender",
					referralSource: "self_signup",
				})
		).rejects.toThrow("User not found in database");
	});

	it("rejects broker-invite requests when the inviter is active but not a broker", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		await seedBrokerMembership(t, {
			brokerIdentity: BROKER,
			roleSlug: "lender",
		});

		await expect(
			t.withIdentity(MEMBER).mutation(api.onboarding.mutations.requestRole, {
				requestedRole: "lender",
				referralSource: "broker_invite",
				invitedByBrokerId: BROKER.subject,
			})
		).rejects.toThrow("not an active broker");
	});

	it("lists pending requests by default and supports status filtering", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);

		const pendingRequestId = await createSelfSignupRequest(t, "lender");
		const secondMember = createMockViewer({
			roles: ["member"],
			subject: "user_member_second",
			email: "member-second@test.fairlend.ca",
		});
		const rejectedRequestId = await createSelfSignupRequest(
			t,
			"lawyer",
			secondMember
		);
		await t
			.withIdentity(FAIRLEND_ADMIN)
			.mutation(api.onboarding.mutations.rejectRequest, {
				requestId: rejectedRequestId,
				rejectionReason: "Rejected for coverage",
			});

		const pending = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.onboarding.queries.listPendingRequests, {});
		expect(pending).toHaveLength(1);
		expect(pending[0]?.request._id).toBe(pendingRequestId);

		const rejected = await t
			.withIdentity(FAIRLEND_ADMIN)
			.query(api.onboarding.queries.listPendingRequests, {
				status: "rejected",
			});
		expect(rejected).toHaveLength(1);
		expect(rejected[0]?.request._id).toBe(rejectedRequestId);
	});

	it("returns null from getMyOnboardingRequest when the caller has no user row", async () => {
		const t = createGovernedTestConvex();
		const unseededMember = createMockViewer({
			roles: ["member"],
			subject: "user_member_missing_history",
		});

		const result = await t
			.withIdentity(unseededMember)
			.query(api.onboarding.queries.getMyOnboardingRequest);
		expect(result).toBeNull();
	});

	it("returns created and approve history in reverse-chronological order", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		setWorkosProvisioningForTests(createProvisioningSuccessMock());

		const requestId = await createSelfSignupRequest(t, "lender");
		await approveRequest(t, requestId);
		await drainScheduledWork(t);

		const history = await getRequestAuditHistory(t, requestId);
		const actions = history.map((event: AuditHistoryEvent) => event.action);
		expect(actions).toContain("transition.onboardingRequest.created");
		expect(actions).toContain("transition.onboardingRequest.approve");
		expect(actions).toContain("onboarding.request_approved");

		const createdIndex = history.findIndex(
			(event: AuditHistoryEvent) =>
				event.action === "transition.onboardingRequest.created"
		);
		const approveIndex = history.findIndex(
			(event: AuditHistoryEvent) =>
				event.action === "transition.onboardingRequest.approve"
		);
		const approvedAuditIndex = history.findIndex(
			(event: AuditHistoryEvent) =>
				event.action === "onboarding.request_approved"
		);

		expect(approvedAuditIndex).toBeLessThan(approveIndex);
		expect(approveIndex).toBeLessThan(createdIndex);

		const request = await getRequest(t, requestId);
		expect(request?.status).toBe("approved");
	});
});
