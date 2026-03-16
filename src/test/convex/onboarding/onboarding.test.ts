import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
	FAIRLEND_BROKERAGE_ORG_ID,
	FAIRLEND_LAWYERS_ORG_ID,
	FAIRLEND_STAFF_ORG_ID,
} from "../../../../convex/constants";
import { createTestConvex, seedFromIdentity } from "../../auth/helpers";
import { BROKER, FAIRLEND_ADMIN, MEMBER } from "../../auth/identities";

interface OnboardingAuditEvent {
	action?: string;
	metadata?: {
		eventType?: string;
		journalEntryId?: string;
		newState?: string;
		outcome?: string;
		previousState?: string;
	};
}

interface AuditJournalRow {
	_id: Id<"auditJournal">;
	actorId: string;
	actorType?: string;
	channel: string;
	entityId: string;
	entityType: string;
	eventType: string;
	newState: string;
	outcome: string;
	payload?: Record<string, unknown>;
	previousState: string;
}

async function getOnboardingAuditEvents(
	t: ReturnType<typeof createTestConvex>,
	requestId: Id<"onboardingRequests">
) {
	await seedFromIdentity(t, FAIRLEND_ADMIN);
	return t
		.withIdentity(FAIRLEND_ADMIN)
		.query(api.onboarding.queries.getRequestHistory, {
			requestId,
		}) as Promise<OnboardingAuditEvent[]>;
}

async function getAuditJournalRows(
	t: ReturnType<typeof createTestConvex>,
	requestId: Id<"onboardingRequests">
) {
	return t.run(async (ctx) => {
		return ctx.db
			.query("auditJournal")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", "onboardingRequest").eq("entityId", requestId)
			)
			.collect();
	}) as Promise<AuditJournalRow[]>;
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

		it("writes a real auditJournal row with flattened source fields", async () => {
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

			const journalRows = await getAuditJournalRows(t, requestId);
			expect(journalRows).toHaveLength(1);
			expect(journalRows[0]).toMatchObject({
				actorId: MEMBER.subject,
				actorType: "member",
				channel: "onboarding_portal",
				entityId: requestId,
				entityType: "onboardingRequest",
				eventType: "CREATED",
				previousState: "none",
				newState: "pending_review",
				outcome: "transitioned",
			});
			expect(journalRows[0].payload).toMatchObject({
				requestedRole: "lender",
				referralSource: "self_signup",
				targetOrganizationId: FAIRLEND_BROKERAGE_ORG_ID,
			});

			const auditEvents = await getOnboardingAuditEvents(t, requestId);
			const createdEvent = auditEvents.find(
				(event) => event.action === "transition.onboardingRequest.created"
			);
			expect(createdEvent?.metadata?.journalEntryId).toBeDefined();
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

	describe("broker_invite org resolution", () => {
		it("resolves target org from the inviting broker's active membership", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			// Seed a broker membership so the lookup succeeds
			await t.run(async (ctx) => {
				await ctx.db.insert("organizationMemberships", {
					workosId: "om_broker_test",
					organizationWorkosId: "org_brokerage_test",
					organizationName: "Test Brokerage",
					userWorkosId: BROKER.subject,
					status: "active",
					roleSlug: "broker",
				});
			});

			const asMember = t.withIdentity(MEMBER);
			const requestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "lender",
					referralSource: "broker_invite",
					invitedByBrokerId: BROKER.subject,
				}
			);

			const request = await t.run(async (ctx) => {
				return ctx.db.get(requestId);
			});
			expect(request?.targetOrganizationId).toBe("org_brokerage_test");
			expect(request?.referralSource).toBe("broker_invite");
			expect(request?.invitedByBrokerId).toBe(BROKER.subject);
		});

		it("rejects when inviting broker has no membership records", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const asMember = t.withIdentity(MEMBER);
			await expect(
				asMember.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "lender",
					referralSource: "broker_invite",
					invitedByBrokerId: "user_nonexistent_broker",
				})
			).rejects.toThrow("not an active broker");
		});

		it("rejects when inviting broker membership is inactive", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			// Seed a deactivated broker membership
			await t.run(async (ctx) => {
				await ctx.db.insert("organizationMemberships", {
					workosId: "om_broker_inactive",
					organizationWorkosId: "org_brokerage_test",
					organizationName: "Test Brokerage",
					userWorkosId: "user_deactivated_broker",
					status: "inactive",
					roleSlug: "broker",
				});
			});

			const asMember = t.withIdentity(MEMBER);
			await expect(
				asMember.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "lender",
					referralSource: "broker_invite",
					invitedByBrokerId: "user_deactivated_broker",
				})
			).rejects.toThrow("not an active broker");
		});
	});

	describe("non-requestable role rejection", () => {
		it("rejects borrower at the validator level", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const asMember = t.withIdentity(MEMBER);
			await expect(
				asMember.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "borrower" as "lender",
					referralSource: "self_signup",
				})
			).rejects.toThrow();
		});

		it("rejects member at the validator level", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);

			const asMember = t.withIdentity(MEMBER);
			await expect(
				asMember.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "member" as "lender",
					referralSource: "self_signup",
				})
			).rejects.toThrow();
		});
	});

	describe("re-request after rejection", () => {
		it("allows a new request after the previous one was rejected", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const asMember = t.withIdentity(MEMBER);
			const asAdmin = t.withIdentity(FAIRLEND_ADMIN);

			// First request
			const firstRequestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "lender",
					referralSource: "self_signup",
				}
			);

			// Admin rejects it
			await asAdmin.mutation(api.onboarding.mutations.rejectRequest, {
				requestId: firstRequestId,
				rejectionReason: "Insufficient documentation",
			});

			// Verify first request is rejected
			const firstRequest = await t.run(async (ctx) => {
				return ctx.db.get(firstRequestId);
			});
			expect(firstRequest?.status).toBe("rejected");

			// Member submits a new request — should succeed
			const secondRequestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "broker",
					referralSource: "self_signup",
				}
			);

			expect(secondRequestId).toBeDefined();
			const secondRequest = await t.run(async (ctx) => {
				return ctx.db.get(secondRequestId);
			});
			expect(secondRequest?.status).toBe("pending_review");
			expect(secondRequest?.requestedRole).toBe("broker");
		});

		it("still blocks re-request while previous request is approved (not yet assigned)", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const asMember = t.withIdentity(MEMBER);
			const asAdmin = t.withIdentity(FAIRLEND_ADMIN);

			const requestId = await asMember.mutation(
				api.onboarding.mutations.requestRole,
				{
					requestedRole: "lender",
					referralSource: "self_signup",
				}
			);

			// Admin approves it (state is now "approved", not yet "role_assigned")
			await asAdmin.mutation(api.onboarding.mutations.approveRequest, {
				requestId,
			});

			// Another request should be blocked
			await expect(
				asMember.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "broker",
					referralSource: "self_signup",
				})
			).rejects.toThrow("You already have a pending role request");
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

	describe("reconciliation", () => {
		it("reports healthy when the latest journal state matches the entity", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const asMember = t.withIdentity(MEMBER);
			await asMember.mutation(api.onboarding.mutations.requestRole, {
				requestedRole: "lender",
				referralSource: "self_signup",
			});

			const result = await t
				.withIdentity(FAIRLEND_ADMIN)
				.query(api.engine.reconciliation.reconcile, {});

			expect(result.discrepancies).toEqual([]);
			expect(result.isHealthy).toBe(true);
		});

		it("records a discrepancy when the entity diverges from the latest journal state", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const requestId = await t
				.withIdentity(MEMBER)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "lender",
					referralSource: "self_signup",
				});

			await t.run(async (ctx) => {
				await ctx.db.patch(requestId, {
					status: "rejected",
				});
			});

			const result = await t
				.withIdentity(FAIRLEND_ADMIN)
				.query(api.engine.reconciliation.reconcile, {});

			expect(result.isHealthy).toBe(false);
			expect(result.discrepancies).toContainEqual(
				expect.objectContaining({
					entityId: requestId,
					entityType: "onboardingRequest",
					entityStatus: "rejected",
					journalNewState: "pending_review",
				})
			);
		});

		it("records ENTITY_NOT_FOUND when journal rows exist for a deleted onboarding request", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const requestId = await t
				.withIdentity(MEMBER)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "lender",
					referralSource: "self_signup",
				});

			await t.run(async (ctx) => {
				await ctx.db.delete(requestId);
			});

			const result = await t
				.withIdentity(FAIRLEND_ADMIN)
				.query(api.engine.reconciliation.reconcile, {});

			expect(result.isHealthy).toBe(false);
			expect(result.discrepancies).toContainEqual(
				expect.objectContaining({
					entityId: requestId,
					entityType: "onboardingRequest",
					entityStatus: "ENTITY_NOT_FOUND",
					journalNewState: "pending_review",
				})
			);
		});

		it("reports a missing Layer 2 chain when journal rows exist but workflow has not completed", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const requestId = await t
				.withIdentity(MEMBER)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "lender",
					referralSource: "self_signup",
				});

			const result = await t
				.withIdentity(FAIRLEND_ADMIN)
				.query(api.engine.reconciliation.reconcileLayer2, {});

			expect(result.isHealthy).toBe(false);
			expect(result.brokenChains).toContainEqual(
				expect.objectContaining({
					entityId: requestId,
					valid: false,
					eventCount: 0,
					error: "No Layer 2 entries found for entity with journal records",
				})
			);
		});

		it("reports healthy Layer 2 chains after scheduled workflow steps complete", async () => {
			const t = createTestConvex();
			await seedFromIdentity(t, MEMBER);
			await seedFromIdentity(t, FAIRLEND_ADMIN);

			const requestId = await t
				.withIdentity(MEMBER)
				.mutation(api.onboarding.mutations.requestRole, {
					requestedRole: "lender",
					referralSource: "self_signup",
				});

			const journalRows = await getAuditJournalRows(t, requestId);
			await t.mutation(internal.engine.hashChain.processHashChainStep, {
				journalEntryId: journalRows[0]._id,
			});

			const result = await t
				.withIdentity(FAIRLEND_ADMIN)
				.query(api.engine.reconciliation.reconcileLayer2, {});

			expect(result.isHealthy).toBe(true);
			expect(result.verifications).toContainEqual(
				expect.objectContaining({
					entityId: requestId,
					valid: true,
					eventCount: 1,
				})
			);
			expect(result.brokenChains).toEqual([]);
		});
	});
});
