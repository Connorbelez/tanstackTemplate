import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../../../convex/_generated/api";
import { FAIRLEND_BROKERAGE_ORG_ID } from "../../../../convex/constants";
import {
	setWorkosProvisioningForTests,
	type WorkosProvisioning,
} from "../../../../convex/engine/effects/workosProvisioning";
import {
	approveRequest,
	createBrokerInviteRequest,
	createGovernedTestConvex,
	createSelfSignupRequest,
	getAuditJournalRows,
	getLatestAuditJournalRow,
	getRequest,
	getRequestAuditHistory,
	runAssignRoleAction,
	seedBrokerMembership,
	seedDefaultGovernedActors,
} from "../onboarding/helpers";

interface AuditHistoryEvent {
	action?: string;
	metadata?: {
		error?: string;
	};
}

function createProvisioningMock(overrides?: {
	createOrganization?: WorkosProvisioning["createOrganization"];
	createOrganizationMembership?: WorkosProvisioning["createOrganizationMembership"];
}): WorkosProvisioning {
	return {
		createOrganization:
			overrides?.createOrganization ??
			vi.fn().mockResolvedValue({ id: "org_provisioned_test" }),
		createOrganizationMembership:
			overrides?.createOrganizationMembership ?? vi.fn().mockResolvedValue({}),
	};
}

async function prepareApprovedRequest(
	requestedRole:
		| "broker"
		| "lawyer"
		| "lender"
		| "jr_underwriter"
		| "sr_underwriter"
		| "underwriter" = "lender"
) {
	const t = createGovernedTestConvex();
	await seedDefaultGovernedActors(t);
	const requestId = await createSelfSignupRequest(t, requestedRole);
	await approveRequest(t, requestId);
	const approveJournal = await getLatestAuditJournalRow(t, requestId);
	if (!approveJournal) {
		throw new Error("Expected approve journal row to exist");
	}
	return { t, requestId, approveJournal };
}

describe("onboarding role-assignment effect", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		setWorkosProvisioningForTests(null);
		vi.restoreAllMocks();
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("assigns a lender into the existing target organization", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("lender");
		const provisioning = createProvisioningMock();
		setWorkosProvisioningForTests(provisioning);

		await runAssignRoleAction(t, {
			entityId: requestId,
			journalEntryId: approveJournal._id,
		});

		expect(provisioning.createOrganization).not.toHaveBeenCalled();
		expect(provisioning.createOrganizationMembership).toHaveBeenCalledWith({
			userId: "user_member_test",
			organizationId: FAIRLEND_BROKERAGE_ORG_ID,
			roleSlug: "lender",
		});

		const request = await getRequest(t, requestId);
		expect(request?.status).toBe("role_assigned");
		expect(request?.activeRoleAssignmentJournalId).toBeUndefined();
		expect(request?.processedRoleAssignmentJournalIds).toContain(
			approveJournal._id
		);

		const auditHistory = await getRequestAuditHistory(t, requestId);
		expect(
			auditHistory.some(
				(event: AuditHistoryEvent) =>
					event.action === "onboarding.role_assigned"
			)
		).toBe(true);
		expect(
			(await getAuditJournalRows(t, requestId)).some(
				(entry) =>
					entry.eventType === "ASSIGN_ROLE" &&
					entry.newState === "role_assigned"
			)
		).toBe(true);
	});

	it("provisions a broker organization when no target org exists", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("broker");
		const provisioning = createProvisioningMock({
			createOrganization: vi
				.fn()
				.mockResolvedValue({ id: "org_broker_provisioned" }),
		});
		setWorkosProvisioningForTests(provisioning);

		await runAssignRoleAction(t, {
			entityId: requestId,
			journalEntryId: approveJournal._id,
		});

		expect(provisioning.createOrganization).toHaveBeenCalledTimes(1);
		expect(provisioning.createOrganizationMembership).toHaveBeenCalledWith({
			userId: "user_member_test",
			organizationId: "org_broker_provisioned",
			roleSlug: "broker",
		});

		const request = await getRequest(t, requestId);
		expect(request?.targetOrganizationId).toBe("org_broker_provisioned");
		expect(request?.status).toBe("role_assigned");
	});

	it("reuses a previously provisioned broker org on retry", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("broker");
		await t.run(async (ctx) => {
			await ctx.db.patch(requestId, {
				targetOrganizationId: "org_existing_broker",
			});
		});

		const provisioning = createProvisioningMock();
		setWorkosProvisioningForTests(provisioning);

		await runAssignRoleAction(t, {
			entityId: requestId,
			journalEntryId: approveJournal._id,
		});

		expect(provisioning.createOrganization).not.toHaveBeenCalled();
		expect(provisioning.createOrganizationMembership).toHaveBeenCalledWith({
			userId: "user_member_test",
			organizationId: "org_existing_broker",
			roleSlug: "broker",
		});
	});

	it("treats duplicate membership errors as success", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("lender");
		const provisioning = createProvisioningMock({
			createOrganizationMembership: vi
				.fn()
				.mockRejectedValue(new Error("membership already exists")),
		});
		setWorkosProvisioningForTests(provisioning);

		await runAssignRoleAction(t, {
			entityId: requestId,
			journalEntryId: approveJournal._id,
		});

		const request = await getRequest(t, requestId);
		expect(request?.status).toBe("role_assigned");
	});

	it("throws when the request cannot be found", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("lender");
		await t.run(async (ctx) => {
			await ctx.db.delete(requestId);
		});

		await expect(
			runAssignRoleAction(t, {
				entityId: requestId,
				journalEntryId: approveJournal._id,
			})
		).rejects.toThrow("Request not found");
	});

	it("throws and logs a failure when the request user cannot be found", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("lender");
		const request = await getRequest(t, requestId);
		if (!request) {
			throw new Error("Expected request to exist");
		}

		await t.run(async (ctx) => {
			await ctx.db.delete(request.userId);
		});

		await expect(
			runAssignRoleAction(t, {
				entityId: requestId,
				journalEntryId: approveJournal._id,
			})
		).rejects.toThrow("User not found");
	});

	it("throws when a non-broker request has no target org", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("lender");
		await t.run(async (ctx) => {
			await ctx.db.patch(requestId, {
				targetOrganizationId: undefined,
			});
		});

		await expect(
			runAssignRoleAction(t, {
				entityId: requestId,
				journalEntryId: approveJournal._id,
			})
		).rejects.toThrow("No target org");

		const auditHistory = await getRequestAuditHistory(t, requestId);
		expect(
			auditHistory.some(
				(event: AuditHistoryEvent) =>
					event.action === "onboarding.role_assignment_failed"
			)
		).toBe(true);
	});

	it("writes a failure audit event and rethrows provider errors", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("lender");
		const provisioning = createProvisioningMock({
			createOrganizationMembership: vi
				.fn()
				.mockRejectedValue(new Error("WorkOS outage")),
		});
		setWorkosProvisioningForTests(provisioning);

		await expect(
			runAssignRoleAction(t, {
				entityId: requestId,
				journalEntryId: approveJournal._id,
			})
		).rejects.toThrow("WorkOS outage");

		const auditHistory = await getRequestAuditHistory(t, requestId);
		expect(
			auditHistory.some(
				(event: AuditHistoryEvent) =>
					event.action === "onboarding.role_assignment_failed" &&
					event.metadata?.error === "WorkOS outage"
			)
		).toBe(true);
	});

	it("returns processed when the journal was already completed", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("lender");
		await t.run(async (ctx) => {
			await ctx.db.patch(requestId, {
				processedRoleAssignmentJournalIds: [approveJournal._id],
			});
		});

		const result = await t.mutation(
			internal.onboarding.internal.beginRoleAssignmentProcessing,
			{
				requestId,
				journalEntryId: approveJournal._id,
			}
		);

		expect(result).toEqual({
			status: "processed",
			targetOrganizationId: FAIRLEND_BROKERAGE_ORG_ID,
		});
	});

	it("returns in_progress when the journal is already active", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("lender");
		await t.run(async (ctx) => {
			await ctx.db.patch(requestId, {
				activeRoleAssignmentJournalId: approveJournal._id,
			});
		});

		const result = await t.mutation(
			internal.onboarding.internal.beginRoleAssignmentProcessing,
			{
				requestId,
				journalEntryId: approveJournal._id,
			}
		);

		expect(result).toEqual({
			status: "in_progress",
			targetOrganizationId: FAIRLEND_BROKERAGE_ORG_ID,
		});
	});

	it("throws when a different journal is already active", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("lender");
		await t.run(async (ctx) => {
			await ctx.db.patch(requestId, {
				activeRoleAssignmentJournalId: "journal_already_running",
			});
		});

		await expect(
			t.mutation(internal.onboarding.internal.beginRoleAssignmentProcessing, {
				requestId,
				journalEntryId: approveJournal._id,
			})
		).rejects.toThrow("already in progress");
	});

	it("clears the active journal and appends it to processed ids on completion", async () => {
		const { t, requestId, approveJournal } =
			await prepareApprovedRequest("lender");
		await t.run(async (ctx) => {
			await ctx.db.patch(requestId, {
				activeRoleAssignmentJournalId: approveJournal._id,
				processedRoleAssignmentJournalIds: ["journal_previous"],
			});
		});

		await t.mutation(
			internal.onboarding.internal.completeRoleAssignmentProcessing,
			{
				requestId,
				journalEntryId: approveJournal._id,
			}
		);

		const request = await getRequest(t, requestId);
		expect(request?.activeRoleAssignmentJournalId).toBeUndefined();
		expect(request?.processedRoleAssignmentJournalIds).toEqual([
			"journal_previous",
			approveJournal._id,
		]);
	});

	it("supports the broker-invite governed path before approval", async () => {
		const t = createGovernedTestConvex();
		await seedDefaultGovernedActors(t);
		await seedBrokerMembership(t);

		const requestId = await createBrokerInviteRequest(t);
		const request = await getRequest(t, requestId);
		expect(request?.targetOrganizationId).toBe("org_brokerage_test");
	});
});
