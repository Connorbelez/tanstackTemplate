import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	FAIRLEND_BROKERAGE_ORG_ID,
	FAIRLEND_LAWYERS_ORG_ID,
	FAIRLEND_STAFF_ORG_ID,
} from "../../../../convex/constants";
import { createTestConvex, seedFromIdentity } from "../../auth/helpers";
import { FAIRLEND_ADMIN, MEMBER } from "../../auth/identities";

interface OnboardingAuditEvent {
	action?: string;
	metadata?: {
		eventType?: string;
		newState?: string;
		outcome?: string;
		previousState?: string;
	};
}

async function getOnboardingAuditEvents(
	t: ReturnType<typeof createTestConvex>,
	requestId: Id<"onboardingRequests">
) {
	await seedFromIdentity(t, FAIRLEND_ADMIN);
	return t
		.withIdentity(FAIRLEND_ADMIN)
		.mutation(api.onboarding.queries.getRequestHistory, {
			requestId,
		}) as Promise<OnboardingAuditEvent[]>;
}

describe("onboarding mutations", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	describe("requestRole", () => {
		it("creates a request in pending_review for a valid role", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const asMember = t.withIdentity(MEMBER);
			const requestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "lender",
					referralSource: "self_signup",
				}
			);

			expect(requestId).toBeDefined();

			// Verify the request was created correctly
			const request = await t.run(async (ctx) => {
				return ctx.db.get(requestId);
			});
			expect(request?.status).toBe("pending_review");
			expect(request?.requestedRole).toBe("lender");
			expect(request?.referralSource).toBe("self_signup");
			expect(request?.targetOrganizationId).toBe(FAIRLEND_BROKERAGE_ORG_ID);
		});

		it("assigns correct target org for lawyer", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const asMember = t.withIdentity(MEMBER);
			const requestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "lawyer",
					referralSource: "self_signup",
				}
			);

			const request = await t.run(async (ctx) => {
				return ctx.db.get(requestId);
			});
			expect(request?.targetOrganizationId).toBe(FAIRLEND_LAWYERS_ORG_ID);
		});

		it("assigns FairLend Staff org for underwriter roles", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const asMember = t.withIdentity(MEMBER);
			const requestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "sr_underwriter",
					referralSource: "self_signup",
				}
			);

			const request = await t.run(async (ctx) => {
				return ctx.db.get(requestId);
			});
			expect(request?.targetOrganizationId).toBe(FAIRLEND_STAFF_ORG_ID);
		});

		it("sets null targetOrganizationId for broker requests", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const asMember = t.withIdentity(MEMBER);
			const requestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "broker",
					referralSource: "self_signup",
				}
			);

			const request = await t.run(async (ctx) => {
				return ctx.db.get(requestId);
			});
			expect(request?.targetOrganizationId).toBeUndefined();
		});

		it("prevents duplicate pending requests", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const asMember = t.withIdentity(MEMBER);
			await asMember.mutation(api.onboarding.mutations.requestRole, {
				requestedRole: "lender",
				referralSource: "self_signup",
			});

			await expect(
				asMember.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "broker",
					referralSource: "self_signup",
				})
			).rejects.toThrow("You already have a pending role request");
		});

		it("requires invitedByBrokerId for broker_invite referral", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const asMember = t.withIdentity(MEMBER);
			await expect(
				asMember.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "lender",
					referralSource: "broker_invite",
				})
			).rejects.toThrow("broker_invite referral requires invitedByBrokerId");
		});

		it("writes a CREATED journal entry", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const asMember = t.withIdentity(MEMBER);
			const requestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "lender",
					referralSource: "self_signup",
				}
			);

			const auditEvents = await getOnboardingAuditEvents(t, requestId);
			const createdEvent = auditEvents.find(
				(event: OnboardingAuditEvent) =>
					event.action === "transition.onboardingRequest.created"
			);

			expect(createdEvent).toBeDefined();
			expect(createdEvent?.metadata?.eventType).toBe("CREATED");
			expect(createdEvent?.metadata?.previousState).toBe("none");
			expect(createdEvent?.metadata?.newState).toBe("pending_review");
			expect(createdEvent?.metadata?.outcome).toBe("transitioned");
		});
	});

	describe("approveRequest", () => {
		it("transitions request from pending_review to approved", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const asMember = t.withIdentity(MEMBER);
			const requestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "lender",
					referralSource: "self_signup",
				}
			);

			const asAdmin = t.withIdentity(FAIRLEND_ADMIN);
			const result = await asAdmin.mutation(
				api.onboarding.mutations.approveRequest,
				{ requestId }
			);

			expect(result.success).toBe(true);
			expect(result.previousState).toBe("pending_review");
			expect(result.newState).toBe("approved");

			// Verify domain fields
			const request = await t.run(async (ctx) => {
				return ctx.db.get(requestId);
			});
			expect(request?.reviewedBy).toBe(FAIRLEND_ADMIN.subject);
			expect(request?.reviewedAt).toBeDefined();
		});

		it("fails when request is not in pending_review state", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const asMember = t.withIdentity(MEMBER);
			const requestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "lender",
					referralSource: "self_signup",
				}
			);

			const asAdmin = t.withIdentity(FAIRLEND_ADMIN);
			// Approve once
			await asAdmin.mutation(api.onboarding.mutations.approveRequest, {
				requestId,
			});
			// Try to approve again
			await expect(
				asAdmin.mutation(api.onboarding.mutations.approveRequest, {
					requestId,
				})
			).rejects.toThrow();
		});
	});

	describe("rejectRequest", () => {
		it("transitions request to rejected with reason", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const asMember = t.withIdentity(MEMBER);
			const requestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "lender",
					referralSource: "self_signup",
				}
			);

			const asAdmin = t.withIdentity(FAIRLEND_ADMIN);
			const result = await asAdmin.mutation(
				api.onboarding.mutations.rejectRequest,
				{
					requestId,
					rejectionReason: "KYC verification failed",
				}
			);

			expect(result.success).toBe(true);
			expect(result.newState).toBe("rejected");

			const request = await t.run(async (ctx) => {
				return ctx.db.get(requestId);
			});
			expect(request?.rejectionReason).toBe("KYC verification failed");
			expect(request?.reviewedBy).toBe(FAIRLEND_ADMIN.subject);
		});
	});

	describe("audit journal", () => {
		it("records all transitions for a request lifecycle", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const asMember = t.withIdentity(MEMBER);
			const requestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "lender",
					referralSource: "self_signup",
				}
			);

			const asAdmin = t.withIdentity(FAIRLEND_ADMIN);
			await asAdmin.mutation(api.onboarding.mutations.approveRequest, {
				requestId,
			});

			const auditEvents = await getOnboardingAuditEvents(t, requestId);
			expect(
				auditEvents.some(
					(event: OnboardingAuditEvent) =>
						event.action === "transition.onboardingRequest.created"
				)
			).toBe(true);
			const approveEvent = auditEvents.find(
				(event: OnboardingAuditEvent) =>
					event.action === "transition.onboardingRequest.approve"
			);
			expect(approveEvent?.metadata?.previousState).toBe("pending_review");
			expect(approveEvent?.metadata?.newState).toBe("approved");
		});
	});

	describe("queries", () => {
		it("getMyOnboardingRequest returns the caller's requests", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const asMember = t.withIdentity(MEMBER);
			await asMember.mutation(api.onboarding.mutations.requestRole, {
				requestedRole: "lender",
				referralSource: "self_signup",
			});

			const requests = await asMember.query(
				api.onboarding.queries.getMyOnboardingRequest
			);
			expect(requests).toHaveLength(1);
			expect(requests?.[0].requestedRole).toBe("lender");
		});
	});
});
