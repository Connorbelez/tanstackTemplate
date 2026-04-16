import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../../convex/constants";
import {
	setWorkosProvisioningForTests,
	type WorkosProvisioning,
} from "../../../../../convex/engine/effects/workosProvisioning";
import { createMockViewer, createTestConvex, ensureSeededIdentity } from "../../../auth/helpers";
import { FAIRLEND_ADMIN } from "../../../auth/identities";

function createProvisioningMock(overrides?: {
	createUser?: WorkosProvisioning["createUser"];
	listUsers?: WorkosProvisioning["listUsers"];
}): WorkosProvisioning {
	return {
		createOrganization: vi
			.fn()
			.mockResolvedValue({ id: "org_unused_for_origination" }),
		createOrganizationMembership: vi.fn().mockResolvedValue({}),
		createUser:
			overrides?.createUser ??
			vi
				.fn()
				.mockResolvedValue({ email: "borrower.new@test.fairlend.ca", id: "user_new" }),
		listUsers: overrides?.listUsers ?? vi.fn().mockResolvedValue([]),
	};
}

async function seedBrokerRecord(
	t: ReturnType<typeof createTestConvex>,
	args?: {
		email?: string;
		orgId?: string;
		subject?: string;
	}
) {
	const brokerIdentity = createMockViewer({
		email: args?.email ?? "broker.origination@test.fairlend.ca",
		firstName: "Case",
		lastName: "Broker",
		orgId: args?.orgId ?? FAIRLEND_STAFF_ORG_ID,
		orgName: "FairLend Staff",
		roles: ["broker"],
		subject: args?.subject ?? "user_origination_broker",
	});
	const userId = await ensureSeededIdentity(t, brokerIdentity);

	return t.run(async (ctx) => {
		const existingBroker = await ctx.db
			.query("brokers")
			.withIndex("by_user", (query) => query.eq("userId", userId))
			.unique();
		if (existingBroker) {
			return existingBroker._id;
		}

		const now = Date.now();
		return ctx.db.insert("brokers", {
			createdAt: now,
			lastTransitionAt: now,
			onboardedAt: now,
			orgId: args?.orgId ?? FAIRLEND_STAFF_ORG_ID,
			status: "active",
			userId,
		});
	});
}

async function seedBorrowerUser(
	t: ReturnType<typeof createTestConvex>,
	args?: {
		email?: string;
		firstName?: string;
		lastName?: string;
		subject?: string;
	}
) {
	const identity = createMockViewer({
		email: args?.email ?? "ada.borrower@test.fairlend.ca",
		firstName: args?.firstName ?? "Ada",
		lastName: args?.lastName ?? "Borrower",
		orgId: FAIRLEND_STAFF_ORG_ID,
		orgName: "FairLend Staff",
		roles: ["member"],
		subject: args?.subject ?? "user_stage_primary_borrower",
	});
	const userId = await ensureSeededIdentity(t, identity);
	return { identity, userId };
}

async function stageCommitReadyCase(
	t: ReturnType<typeof createTestConvex>,
	args: {
		brokerOfRecordId: Id<"brokers">;
		primaryBorrowerEmail: string;
		primaryBorrowerName?: string;
		propertyDraft?:
			| {
					create: {
						city: string;
						postalCode: string;
						propertyType: "commercial" | "condo" | "multi_unit" | "residential";
						province: string;
						streetAddress: string;
						unit?: string;
				  };
			  }
			| { propertyId: string };
	}
) {
	const caseId = await t.withIdentity(FAIRLEND_ADMIN).mutation(
		api.admin.origination.cases.createCase,
		{}
	);

	await t.withIdentity(FAIRLEND_ADMIN).mutation(
		api.admin.origination.cases.patchCase,
		{
			caseId,
			patch: {
				currentStep: "review",
				participantsDraft: {
					brokerOfRecordId: args.brokerOfRecordId,
					primaryBorrower: {
						draftId: "primary-borrower-1",
						email: args.primaryBorrowerEmail,
						fullName: args.primaryBorrowerName ?? "Ada Borrower",
					},
				},
				propertyDraft: args.propertyDraft ?? {
					create: {
						city: "Toronto",
						postalCode: "M5H 1J9",
						propertyType: "residential",
						province: "ON",
						streetAddress: "123 King St W",
					},
				},
				valuationDraft: {
					valueAsIs: 425_000,
				},
				mortgageDraft: {
					amortizationMonths: 300,
					firstPaymentDate: "2026-06-01",
					interestAdjustmentDate: "2026-05-01",
					interestRate: 9.5,
					lienPosition: 1,
					loanType: "conventional",
					maturityDate: "2027-04-30",
					paymentAmount: 2_450,
					paymentFrequency: "monthly",
					principal: 250_000,
					rateType: "fixed",
					termMonths: 12,
					termStartDate: "2026-05-01",
				},
			},
		}
	);

	return caseId;
}

async function countCanonicalRows(t: ReturnType<typeof createTestConvex>) {
	return t.run(async (ctx) => {
		const [
			appraisals,
			auditJournal,
			borrowers,
			ledgerAccounts,
			ledgerEntries,
			mortgageValuationSnapshots,
			mortgageBorrowers,
			mortgages,
			properties,
		] = await Promise.all([
			ctx.db.query("appraisals").collect(),
			ctx.db.query("auditJournal").collect(),
			ctx.db.query("borrowers").collect(),
			ctx.db.query("ledger_accounts").collect(),
			ctx.db.query("ledger_journal_entries").collect(),
			ctx.db.query("mortgageValuationSnapshots").collect(),
			ctx.db.query("mortgageBorrowers").collect(),
			ctx.db.query("mortgages").collect(),
			ctx.db.query("properties").collect(),
		]);

		return {
			appraisals: appraisals.length,
			auditJournal: auditJournal.length,
			borrowers: borrowers.length,
			ledgerAccounts: ledgerAccounts.length,
			ledgerEntries: ledgerEntries.length,
			mortgageValuationSnapshots: mortgageValuationSnapshots.length,
			mortgageBorrowers: mortgageBorrowers.length,
			mortgages: mortgages.length,
			properties: properties.length,
		};
	});
}

describe("admin origination commit", () => {
	beforeEach(() => {
		process.env.DISABLE_GT_HASHCHAIN = "true";
	});

	afterEach(() => {
		delete process.env.DISABLE_GT_HASHCHAIN;
		setWorkosProvisioningForTests(null);
		vi.restoreAllMocks();
	});

	it("commits a staged case into canonical rows and replays idempotently", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const { identity: borrowerIdentity } = await seedBorrowerUser(t);
		const provisioning = createProvisioningMock();
		setWorkosProvisioningForTests(provisioning);

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			primaryBorrowerEmail: borrowerIdentity.user_email,
			primaryBorrowerName: "Ada Borrower",
		});

		const firstResult = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);
		const secondResult = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);

		expect(firstResult.status).toBe("committed");
		expect(firstResult.wasAlreadyCommitted).toBe(false);
		expect(secondResult).toMatchObject({
			committedMortgageId: firstResult.committedMortgageId,
			propertyId: firstResult.propertyId,
			status: "committed",
			wasAlreadyCommitted: true,
		});
		expect(provisioning.listUsers).not.toHaveBeenCalled();
		expect(provisioning.createUser).not.toHaveBeenCalled();

		const artifacts = await t.run(async (ctx) => {
			const caseRecord = await ctx.db.get(caseId);
			const borrowers = await ctx.db.query("borrowers").collect();
			const properties = await ctx.db.query("properties").collect();
			const appraisals = await ctx.db.query("appraisals").collect();
			const mortgageValuationSnapshots = await ctx.db
				.query("mortgageValuationSnapshots")
				.collect();
			const mortgages = await ctx.db.query("mortgages").collect();
			const mortgageBorrowers = await ctx.db.query("mortgageBorrowers").collect();
			const auditJournal = await ctx.db.query("auditJournal").collect();
			const ledgerAccounts = await ctx.db
				.query("ledger_accounts")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", firstResult.committedMortgageId)
				)
				.collect();
			const ledgerEntries = await ctx.db
				.query("ledger_journal_entries")
				.withIndex("by_mortgage_and_time", (query) =>
					query.eq("mortgageId", firstResult.committedMortgageId)
				)
				.collect();

			return {
				appraisals,
				auditJournal,
				borrowers,
				caseRecord,
				ledgerAccounts,
				ledgerEntries,
				mortgageValuationSnapshots,
				mortgageBorrowers,
				mortgages,
				properties,
			};
		});

		expect(artifacts.caseRecord).toMatchObject({
			committedMortgageId: firstResult.committedMortgageId,
			status: "committed",
		});
		expect(artifacts.caseRecord?.committedValuationSnapshotId).toBeDefined();
		expect(artifacts.borrowers).toHaveLength(1);
		expect(artifacts.properties).toHaveLength(1);
		expect(artifacts.appraisals).toHaveLength(1);
		expect(artifacts.mortgageValuationSnapshots).toHaveLength(1);
		expect(artifacts.mortgages).toHaveLength(1);
		expect(artifacts.mortgageBorrowers).toHaveLength(1);
		expect(artifacts.borrowers[0]).toMatchObject({
			creationSource: "admin_direct",
			originatingWorkflowId: String(caseId),
			originatingWorkflowType: "admin_origination_case",
		});
		expect(artifacts.mortgages[0]).toMatchObject({
			collectionExecutionMode: "app_owned",
			creationSource: "admin_direct",
			machineContext: {
				lastPaymentAt: 0,
				missedPayments: 0,
			},
			originationPath: "admin_direct",
			originatedByUserId: String(artifacts.caseRecord?.updatedByUserId),
			originatingWorkflowId: String(caseId),
			originatingWorkflowType: "admin_origination_case",
			orgId: FAIRLEND_STAFF_ORG_ID,
			status: "active",
			workflowSourceType: "admin_origination_case",
		});
		expect(artifacts.mortgageValuationSnapshots[0]).toMatchObject({
			mortgageId: firstResult.committedMortgageId,
			propertyId: firstResult.propertyId,
			valueAsIs: 425_000,
		});
		expect(artifacts.mortgages[0].collectionExecutionProviderCode).toBeUndefined();
		expect(
			artifacts.mortgages[0].activeExternalCollectionScheduleId
		).toBeUndefined();
		expect(artifacts.mortgages[0].collectionExecutionUpdatedAt).toBe(
			artifacts.mortgages[0].createdAt
		);
		expect(artifacts.mortgages[0].lastTransitionAt).toBe(
			artifacts.mortgages[0].createdAt
		);
		expect(artifacts.ledgerAccounts.some((account) => account.type === "TREASURY")).toBe(
			true
		);
		expect(
			artifacts.ledgerEntries.some(
				(entry) => entry.entryType === "MORTGAGE_MINTED"
			)
		).toBe(true);
		expect(
			artifacts.auditJournal.some(
				(entry) =>
					entry.entityId === firstResult.committedMortgageId &&
					entry.eventType === "ORIGINATION_COMMITTED"
			)
		).toBe(true);
		expect(firstResult.valuationSnapshotId).toBe(
			String(artifacts.mortgageValuationSnapshots[0]?._id)
		);
	});

	it("reuses an existing same-org borrower and matching property", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const { userId, identity } = await seedBorrowerUser(t, {
			email: "existing.borrower@test.fairlend.ca",
			subject: "user_existing_same_org_borrower",
		});

		const { borrowerId, propertyId } = await t.run(async (ctx) => {
			const now = Date.now();
			const borrowerId = await ctx.db.insert("borrowers", {
				createdAt: now,
				lastTransitionAt: now,
				onboardedAt: now,
				orgId: FAIRLEND_STAFF_ORG_ID,
				status: "active",
				userId,
			});
			const propertyId = await ctx.db.insert("properties", {
				city: "Toronto",
				createdAt: now,
				postalCode: "M5H 1J9",
				propertyType: "residential",
				province: "ON",
				streetAddress: "123 King St W",
			});
			return { borrowerId, propertyId };
		});

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			primaryBorrowerEmail: identity.user_email,
			primaryBorrowerName: "Existing Borrower",
		});

		const before = await countCanonicalRows(t);
		const result = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);
		const after = await countCanonicalRows(t);

		expect(result.status).toBe("committed");
		expect(result.borrowerIds).toEqual([String(borrowerId)]);
		expect(result.propertyId).toBe(String(propertyId));
		expect(after.borrowers).toBe(before.borrowers);
		expect(after.properties).toBe(before.properties);
		expect(after.mortgageValuationSnapshots).toBe(
			before.mortgageValuationSnapshots + 1
		);
		expect(after.mortgages).toBe(before.mortgages + 1);
		expect(after.mortgageBorrowers).toBe(before.mortgageBorrowers + 1);
	});

	it("stops at awaiting identity sync before canonical writes", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const provisioning = createProvisioningMock({
			createUser: vi
				.fn()
				.mockResolvedValue({ email: "pending.sync@test.fairlend.ca", id: "user_workos_pending" }),
		});
		setWorkosProvisioningForTests(provisioning);

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			primaryBorrowerEmail: "pending.sync@test.fairlend.ca",
			primaryBorrowerName: "Pending Sync",
		});

		const before = await countCanonicalRows(t);
		const result = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);
		const after = await countCanonicalRows(t);
		const caseRecord = await t.run(async (ctx) => ctx.db.get(caseId));

		expect(result).toMatchObject({
			status: "awaiting_identity_sync",
		});
		expect(result.pendingIdentities).toEqual([
			{
				email: "pending.sync@test.fairlend.ca",
				fullName: "Pending Sync",
				role: "primary",
				workosUserId: "user_workos_pending",
			},
		]);
		expect(provisioning.listUsers).toHaveBeenCalledWith({
			email: "pending.sync@test.fairlend.ca",
		});
		expect(provisioning.createUser).toHaveBeenCalledWith({
			email: "pending.sync@test.fairlend.ca",
			firstName: "Pending",
			lastName: "Sync",
		});
		expect(after).toEqual(before);
		expect(caseRecord?.status).toBe("awaiting_identity_sync");
	});

	it("marks the case as ready before commit, transitions through committing, and records durable failures", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const { identity } = await seedBorrowerUser(t, {
			email: "failing.commit.borrower@test.fairlend.ca",
			subject: "user_failing_commit_borrower",
		});

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			primaryBorrowerEmail: identity.user_email,
			primaryBorrowerName: "Failing Commit Borrower",
		});

		const stagedCase = await t.run(async (ctx) => ctx.db.get(caseId));
		expect(stagedCase?.status).toBe("ready_to_commit");

		await t.run(async (ctx) => {
			await ctx.db.delete(brokerOfRecordId);
		});

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).action(
				api.admin.origination.commit.commitCase,
				{ caseId }
			)
		).rejects.toThrow("Broker of record no longer exists");

		const failedCase = await t.run(async (ctx) => ctx.db.get(caseId));
		expect(failedCase).toMatchObject({
			status: "failed",
		});
		expect(failedCase?.failedAt).toBeTypeOf("number");
		expect(failedCase?.lastCommitError).toContain(
			"Broker of record no longer exists"
		);
	});

	it("fails closed when the same user already has a borrower in another org", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const { userId, identity } = await seedBorrowerUser(t, {
			email: "cross.org.borrower@test.fairlend.ca",
			subject: "user_cross_org_borrower",
		});

		await t.run(async (ctx) => {
			const now = Date.now();
			await ctx.db.insert("borrowers", {
				createdAt: now,
				lastTransitionAt: now,
				onboardedAt: now,
				orgId: "org_other_borrower_scope",
				status: "active",
				userId,
			});
		});

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			primaryBorrowerEmail: identity.user_email,
			primaryBorrowerName: "Cross Org Borrower",
		});
		const before = await countCanonicalRows(t);

		await expect(
			t.withIdentity(FAIRLEND_ADMIN).action(
				api.admin.origination.commit.commitCase,
				{ caseId }
			)
		).rejects.toThrow("already exists in another organization");

		const after = await countCanonicalRows(t);
		expect(after).toEqual(before);
	});
});
