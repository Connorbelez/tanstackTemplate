import { vi } from "vitest";
import { api, components, internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { auditLog } from "../../../../convex/auditLog";
import { AuditTrail } from "../../../../convex/auditTrailClient";
import type { MockIdentity } from "../../auth/helpers";
import { createTestConvex, ensureSeededIdentity } from "../../auth/helpers";
import { BROKER, FAIRLEND_ADMIN, MEMBER } from "../../auth/identities";

const auditTrail = new AuditTrail(components.auditTrail);

export type GovernedTestConvex = ReturnType<typeof createTestConvex>;

export function createGovernedTestConvex(options?: {
	includeWorkflowComponents?: boolean;
}) {
	return createTestConvex(options);
}

export async function seedDefaultGovernedActors(t: GovernedTestConvex) {
	await ensureSeededIdentity(t, MEMBER);
	await ensureSeededIdentity(t, BROKER);
	await ensureSeededIdentity(t, FAIRLEND_ADMIN);
}

export async function seedBrokerMembership(
	t: GovernedTestConvex,
	options?: {
		brokerIdentity?: MockIdentity;
		organizationName?: string;
		organizationWorkosId?: string;
		roleSlug?: string;
		status?: string;
	}
) {
	const brokerIdentity = options?.brokerIdentity ?? BROKER;
	return t.run(async (ctx) => {
		return ctx.db.insert("organizationMemberships", {
			workosId: `membership_${brokerIdentity.subject}_${Date.now()}`,
			organizationWorkosId:
				options?.organizationWorkosId ??
				brokerIdentity.org_id ??
				"org_brokerage_test",
			organizationName:
				options?.organizationName ?? brokerIdentity.organization_name,
			userWorkosId: brokerIdentity.subject,
			status: options?.status ?? "active",
			roleSlug: options?.roleSlug ?? "broker",
		});
	});
}

export async function createSelfSignupRequest(
	t: GovernedTestConvex,
	requestedRole:
		| "admin"
		| "broker"
		| "jr_underwriter"
		| "lawyer"
		| "lender"
		| "sr_underwriter"
		| "underwriter",
	identity: MockIdentity = MEMBER
) {
	await ensureSeededIdentity(t, identity);
	return t
		.withIdentity(identity)
		.mutation(api.onboarding.mutations.requestRole, {
			requestedRole,
			referralSource: "self_signup",
		});
}

export async function createBrokerInviteRequest(
	t: GovernedTestConvex,
	options?: {
		brokerIdentity?: MockIdentity;
		invitedByBrokerId?: string;
		identity?: MockIdentity;
	}
) {
	const identity = options?.identity ?? MEMBER;
	await ensureSeededIdentity(t, identity);
	await ensureSeededIdentity(t, options?.brokerIdentity ?? BROKER);
	return t
		.withIdentity(identity)
		.mutation(api.onboarding.mutations.requestRole, {
			requestedRole: "lender",
			referralSource: "broker_invite",
			invitedByBrokerId:
				options?.invitedByBrokerId ??
				options?.brokerIdentity?.subject ??
				BROKER.subject,
		});
}

export async function approveRequest(
	t: GovernedTestConvex,
	requestId: Id<"onboardingRequests">
) {
	return t
		.withIdentity(FAIRLEND_ADMIN)
		.mutation(api.onboarding.mutations.approveRequest, { requestId });
}

export async function rejectRequest(
	t: GovernedTestConvex,
	requestId: Id<"onboardingRequests">,
	rejectionReason = "Rejected in test"
) {
	return t
		.withIdentity(FAIRLEND_ADMIN)
		.mutation(api.onboarding.mutations.rejectRequest, {
			requestId,
			rejectionReason,
		});
}

export async function getRequest(
	t: GovernedTestConvex,
	requestId: Id<"onboardingRequests">
) {
	return t.run(async (ctx) => ctx.db.get(requestId));
}

export async function getAuditJournalRows(
	t: GovernedTestConvex,
	requestId: Id<"onboardingRequests">
) {
	return t.run(async (ctx) => {
		return ctx.db
			.query("auditJournal")
			.withIndex("by_entity", (q) =>
				q.eq("entityType", "onboardingRequest").eq("entityId", requestId)
			)
			.collect();
	});
}

export async function getLatestAuditJournalRow(
	t: GovernedTestConvex,
	requestId: Id<"onboardingRequests">
) {
	const journalRows = await getAuditJournalRows(t, requestId);
	return journalRows.at(-1) ?? null;
}

export async function getRequestAuditHistory(
	t: GovernedTestConvex,
	requestId: Id<"onboardingRequests">
) {
	return t
		.withIdentity(FAIRLEND_ADMIN)
		.query(api.onboarding.queries.getRequestHistory, { requestId });
}

export async function getAuditTrailEvents(
	t: GovernedTestConvex,
	entityId: string
) {
	return t.run(async (ctx) => auditTrail.queryByEntity(ctx, { entityId }));
}

export async function verifyAuditTrail(
	t: GovernedTestConvex,
	entityId: string
) {
	return t.run(async (ctx) => auditTrail.verifyChain(ctx, { entityId }));
}

export async function getAuditLogEvents(
	t: GovernedTestConvex,
	resourceId: string
) {
	return t.run(async (ctx) =>
		auditLog.queryByResource(ctx, {
			resourceType: "onboardingRequests",
			resourceId,
			limit: 100,
		})
	);
}

export async function runAssignRoleAction(
	t: GovernedTestConvex,
	args: {
		entityId: string;
		effectName?: string;
		journalEntryId: string;
	}
) {
	return t.action(internal.engine.effects.onboarding.assignRole, {
		entityId: args.entityId,
		entityType: "onboardingRequest",
		eventType: "ASSIGN_ROLE",
		journalEntryId: args.journalEntryId,
		effectName: args.effectName ?? "assignRole",
		source: { channel: "scheduler", actorType: "system" },
	});
}

export async function drainScheduledWork(t: GovernedTestConvex) {
	await t.finishAllScheduledFunctions(() => vi.runAllTimers());
}
