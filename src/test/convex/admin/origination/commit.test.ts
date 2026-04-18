import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../../../convex/_generated/server";
import { FAIRLEND_STAFF_ORG_ID } from "../../../../../convex/constants";
import {
	setWorkosProvisioningForTests,
	type WorkosProvisioning,
} from "../../../../../convex/engine/effects/workosProvisioning";
import { activateMortgageAggregate } from "../../../../../convex/mortgages/activateMortgageAggregate";
import { buildAdminDirectMortgageActivationSource } from "../../../../../convex/mortgages/provenance";
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

async function seedBorrowerProfile(
	t: ReturnType<typeof createTestConvex>,
	args: {
		orgId?: string;
		userId: Id<"users">;
	}
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		return ctx.db.insert("borrowers", {
			createdAt: now,
			lastTransitionAt: now,
			onboardedAt: now,
			orgId: args.orgId ?? FAIRLEND_STAFF_ORG_ID,
			status: "active",
			userId: args.userId,
		});
	});
}

async function seedValidatedBorrowerBankAccount(
	t: ReturnType<typeof createTestConvex>,
	args: {
		borrowerId: Id<"borrowers">;
		customerReference?:
			| { rotessaCustomerCustomIdentifier: string }
			| { rotessaCustomerId: number };
		mandateStatus?: "active" | "not_required" | "pending" | "revoked";
		status?: "pending_validation" | "validated" | "revoked" | "rejected";
	}
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		return ctx.db.insert("bankAccounts", {
			accountLast4: "6789",
			country: "CA",
			createdAt: now,
			currency: "CAD",
			institutionNumber: "001",
			isDefaultInbound: true,
			mandateStatus: args.mandateStatus ?? "active",
			metadata:
				args.customerReference ?? {
					rotessaCustomerCustomIdentifier: "borrower-rotessa-001",
				},
			ownerId: String(args.borrowerId),
			ownerType: "borrower",
			status: args.status ?? "validated",
			transitNumber: "00011",
			updatedAt: now,
			validationMethod: "provider_verified",
		});
	});
}

function jsonResponse(body: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(body), {
		headers: { "Content-Type": "application/json" },
		status: 200,
		...init,
	});
}

function mockRotessaRecurringScheduleCreation() {
	process.env.ROTESSA_API_KEY = "test-rotessa-key";
	const scheduleResponse = {
		amount: "2450.00",
		comment: "provider managed schedule",
		created_at: "2026-01-01T00:00:00.000Z",
		financial_transactions: [],
		frequency: "Monthly",
		id: 987,
		installments: 11,
		next_process_date: "2026-06-01",
		process_date: "2026-06-01",
		updated_at: "2026-01-01T00:00:00.000Z",
	};

	return vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			if (
				(url.pathname.endsWith("/transaction_schedules") ||
					url.pathname.endsWith(
						"/transaction_schedules/create_with_custom_identifier"
					)) &&
				(init?.method ?? "GET") === "POST"
			) {
				return jsonResponse(scheduleResponse);
			}
			if (/\/transaction_schedules\/\d+$/.test(url.pathname)) {
				return jsonResponse(scheduleResponse);
			}
			return new Response("not found", { status: 404 });
		})
	);
}

async function seedActiveScheduleRule(
	t: ReturnType<typeof createTestConvex>,
	args?: {
		delayDays?: number;
		scope?: { mortgageId: Id<"mortgages">; scopeType: "mortgage" } | { scopeType: "global" };
	}
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		return ctx.db.insert("collectionRules", {
			code: `schedule-rule-${now}`,
			config: {
				delayDays: args?.delayDays ?? 9,
				kind: "schedule",
			},
			createdAt: now,
			createdByActorId: "test_admin",
			description: "Origination bootstrap schedule rule for tests",
			displayName: "Origination schedule rule",
			effectiveFrom: now - 1_000,
			kind: "schedule",
			priority: 10,
			scope: args?.scope ?? { scopeType: "global" as const },
			status: "active",
			trigger: "schedule",
			updatedAt: now,
			updatedByActorId: "test_admin",
			version: 1,
		});
	});
}

async function stageCommitReadyCase(
	t: ReturnType<typeof createTestConvex>,
	args: {
		brokerOfRecordId: Id<"brokers">;
		collectionsDraft?: {
			mode?: "app_owned_only" | "none" | "provider_managed_now";
			providerCode?: "pad_rotessa";
			selectedBankAccountId?: Id<"bankAccounts">;
		};
		listingOverrides?: {
			description?: string;
			title?: string;
		};
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
				collectionsDraft: args.collectionsDraft,
				valuationDraft: {
					valueAsIs: 425_000,
				},
				listingOverrides: args.listingOverrides,
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

async function stageStaticDocumentDrafts(
	t: ReturnType<typeof createTestConvex>,
	args: {
		caseId: Id<"adminOriginationCases">;
	}
) {
	return t.run(async (ctx) => {
		const adminUser = await ctx.db
			.query("users")
			.withIndex("authId", (query) => query.eq("authId", FAIRLEND_ADMIN.subject))
			.unique();
		if (!adminUser) {
			throw new Error("Admin user was not seeded");
		}

		const publicFileRef = await (
			ctx.storage as unknown as {
				store: (blob: Blob) => Promise<Id<"_storage">>;
			}
		).store(new Blob(["public static pdf"]));
		const privateFileRef = await (
			ctx.storage as unknown as {
				store: (blob: Blob) => Promise<Id<"_storage">>;
			}
		).store(new Blob(["private static pdf"]));
		const publicAssetId = await ctx.db.insert("documentAssets", {
			description: "Public teaser",
			fileHash: `public-${Date.now()}`,
			fileRef: publicFileRef,
			fileSize: 101,
			mimeType: "application/pdf",
			name: "Public teaser",
			originalFilename: "public-teaser.pdf",
			pageCount: 1,
			source: "admin_upload",
			uploadedAt: Date.now(),
			uploadedByUserId: adminUser._id,
		});
		const privateAssetId = await ctx.db.insert("documentAssets", {
			description: "Internal title binder",
			fileHash: `private-${Date.now()}`,
			fileRef: privateFileRef,
			fileSize: 102,
			mimeType: "application/pdf",
			name: "Internal title binder",
			originalFilename: "private-binder.pdf",
			pageCount: 1,
			source: "admin_upload",
			uploadedAt: Date.now(),
			uploadedByUserId: adminUser._id,
		});

		await ctx.db.insert("originationCaseDocumentDrafts", {
			archivedAt: undefined,
			archivedByUserId: undefined,
			assetId: publicAssetId,
			caseId: args.caseId,
			category: "marketing",
			class: "public_static",
			createdAt: Date.now(),
			createdByUserId: adminUser._id,
			description: "Visible to listing viewers",
			displayName: "Public teaser",
			displayOrder: 0,
			packageKey: "public",
			packageLabel: "Public docs",
			selectedFromGroupId: undefined,
			sourceKind: "asset",
			status: "active",
			supersededByDraftId: undefined,
			templateId: undefined,
			templateVersion: undefined,
			updatedAt: Date.now(),
			updatedByUserId: adminUser._id,
			validationSummary: {
				containsSignableFields: false,
				requiredPlatformRoles: [],
				requiredVariableKeys: [],
				unsupportedPlatformRoles: [],
				unsupportedVariableKeys: [],
			},
		});
		await ctx.db.insert("originationCaseDocumentDrafts", {
			archivedAt: undefined,
			archivedByUserId: undefined,
			assetId: privateAssetId,
			caseId: args.caseId,
			category: "internal",
			class: "private_static",
			createdAt: Date.now(),
			createdByUserId: adminUser._id,
			description: "Visible only in internal/deal surfaces",
			displayName: "Internal title binder",
			displayOrder: 1,
			packageKey: "private",
			packageLabel: "Private docs",
			selectedFromGroupId: undefined,
			sourceKind: "asset",
			status: "active",
			supersededByDraftId: undefined,
			templateId: undefined,
			templateVersion: undefined,
			updatedAt: Date.now(),
			updatedByUserId: adminUser._id,
			validationSummary: {
				containsSignableFields: false,
				requiredPlatformRoles: [],
				requiredVariableKeys: [],
				unsupportedPlatformRoles: [],
				unsupportedVariableKeys: [],
			},
		});

		return { privateAssetId, publicAssetId, publicFileRef };
	});
}

async function countCanonicalRows(t: ReturnType<typeof createTestConvex>) {
	return t.run(async (ctx) => {
			const [
				appraisals,
				auditJournal,
				borrowers,
				collectionAttempts,
				collectionPlanEntries,
				ledgerAccounts,
				ledgerEntries,
				listings,
				mortgageDocumentBlueprints,
				mortgageValuationSnapshots,
				mortgageBorrowers,
				mortgages,
				obligations,
				properties,
				transferRequests,
			] = await Promise.all([
			ctx.db.query("appraisals").collect(),
			ctx.db.query("auditJournal").collect(),
				ctx.db.query("borrowers").collect(),
				ctx.db.query("collectionAttempts").collect(),
				ctx.db.query("collectionPlanEntries").collect(),
				ctx.db.query("ledger_accounts").collect(),
				ctx.db.query("ledger_journal_entries").collect(),
				ctx.db.query("listings").collect(),
				ctx.db.query("mortgageDocumentBlueprints").collect(),
				ctx.db.query("mortgageValuationSnapshots").collect(),
				ctx.db.query("mortgageBorrowers").collect(),
				ctx.db.query("mortgages").collect(),
				ctx.db.query("obligations").collect(),
				ctx.db.query("properties").collect(),
				ctx.db.query("transferRequests").collect(),
		]);

		return {
			appraisals: appraisals.length,
			auditJournal: auditJournal.length,
			borrowers: borrowers.length,
			collectionAttempts: collectionAttempts.length,
			collectionPlanEntries: collectionPlanEntries.length,
			ledgerAccounts: ledgerAccounts.length,
			ledgerEntries: ledgerEntries.length,
			listings: listings.length,
			mortgageDocumentBlueprints: mortgageDocumentBlueprints.length,
			mortgageValuationSnapshots: mortgageValuationSnapshots.length,
			mortgageBorrowers: mortgageBorrowers.length,
			mortgages: mortgages.length,
			obligations: obligations.length,
			properties: properties.length,
			transferRequests: transferRequests.length,
		};
	});
}

describe("admin origination commit", () => {
	beforeEach(() => {
		process.env.DISABLE_GT_HASHCHAIN = "true";
	});

	afterEach(() => {
		delete process.env.DISABLE_GT_HASHCHAIN;
		delete process.env.ROTESSA_API_KEY;
		setWorkosProvisioningForTests(null);
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
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
			listingOverrides: {
				description: "Curated description from origination",
				title: "King West bridge opportunity",
			},
			primaryBorrowerEmail: borrowerIdentity.user_email,
			primaryBorrowerName: "Ada Borrower",
		});
		const stagedDocuments = await stageStaticDocumentDrafts(t, { caseId });

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
			committedListingId: firstResult.committedListingId,
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
			const listings = await ctx.db.query("listings").collect();
			const mortgageDocumentBlueprints = await ctx.db
				.query("mortgageDocumentBlueprints")
				.collect();
			const mortgageValuationSnapshots = await ctx.db
				.query("mortgageValuationSnapshots")
				.collect();
			const mortgages = await ctx.db.query("mortgages").collect();
			const mortgageBorrowers = await ctx.db.query("mortgageBorrowers").collect();
			const obligations = await ctx.db
				.query("obligations")
				.withIndex("by_mortgage_and_date", (query) =>
					query.eq("mortgageId", firstResult.committedMortgageId)
				)
				.collect();
			const collectionPlanEntries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (query) =>
					query.eq("mortgageId", firstResult.committedMortgageId)
				)
				.collect();
			const collectionAttempts = await ctx.db
				.query("collectionAttempts")
				.withIndex("by_mortgage_status", (query) =>
					query.eq("mortgageId", firstResult.committedMortgageId)
				)
				.collect();
			const transferRequests = await ctx.db
				.query("transferRequests")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", firstResult.committedMortgageId)
				)
				.collect();
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
				collectionAttempts,
				collectionPlanEntries,
				ledgerAccounts,
				ledgerEntries,
				listings,
				mortgageDocumentBlueprints,
				mortgageValuationSnapshots,
				mortgageBorrowers,
				mortgages,
				obligations,
				properties,
				transferRequests,
			};
		});

		expect(artifacts.caseRecord).toMatchObject({
			committedListingId: firstResult.committedListingId,
			committedMortgageId: firstResult.committedMortgageId,
			status: "committed",
		});
		expect(artifacts.caseRecord?.committedValuationSnapshotId).toBeDefined();
		expect(artifacts.borrowers).toHaveLength(1);
		expect(artifacts.properties).toHaveLength(1);
		expect(artifacts.appraisals).toHaveLength(1);
		expect(artifacts.listings).toHaveLength(1);
		expect(artifacts.mortgageDocumentBlueprints).toHaveLength(2);
		expect(artifacts.mortgageValuationSnapshots).toHaveLength(1);
		expect(artifacts.mortgages).toHaveLength(1);
		expect(artifacts.mortgageBorrowers).toHaveLength(1);
		expect(artifacts.obligations).toHaveLength(12);
		expect(artifacts.collectionPlanEntries).toHaveLength(12);
		expect(artifacts.collectionAttempts).toHaveLength(0);
		expect(artifacts.transferRequests).toHaveLength(0);
		expect(artifacts.borrowers[0]).toMatchObject({
			creationSource: "admin_direct",
			originatingWorkflowId: String(caseId),
			originatingWorkflowType: "admin_origination_case",
		});
		expect(artifacts.mortgages[0]).toMatchObject({
			collectionExecutionMode: "app_owned",
			paymentBootstrapScheduleRuleMissing: true,
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
		expect(artifacts.mortgageDocumentBlueprints).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					assetId: stagedDocuments.publicAssetId,
					class: "public_static",
					displayName: "Public teaser",
					status: "active",
				}),
				expect.objectContaining({
					assetId: stagedDocuments.privateAssetId,
					class: "private_static",
					displayName: "Internal title binder",
					status: "active",
				}),
			])
		);
		expect(artifacts.listings[0]?.publicDocumentIds).toEqual([
			stagedDocuments.publicFileRef,
		]);
		expect(artifacts.obligations[0]).toMatchObject({
			amount: 2_450,
			amountSettled: 0,
			paymentNumber: 1,
			status: "upcoming",
			type: "regular_interest",
		});
		expect(artifacts.obligations[artifacts.obligations.length - 1]).toMatchObject({
			amount: 250_000,
			paymentNumber: 12,
			status: "upcoming",
			type: "principal_repayment",
		});
		expect(
			artifacts.collectionPlanEntries.every(
				(entry) =>
					entry.executionMode === "app_owned" && entry.status === "planned"
			)
		).toBe(true);
		expect(artifacts.mortgageValuationSnapshots[0]).toMatchObject({
			createdByUserId: artifacts.caseRecord?.updatedByUserId,
			mortgageId: firstResult.committedMortgageId,
			source: "admin_origination",
			valuationDate: "2026-05-01",
			valueAsIs: 425_000,
		});
		expect(artifacts.listings[0]).toMatchObject({
			description: "Curated description from origination",
			dataSource: "mortgage_pipeline",
			interestRate: 9.5,
			latestAppraisalDate: "2026-05-01",
			latestAppraisalValueAsIs: 425_000,
			monthlyPayment: 2_450,
			mortgageId: firstResult.committedMortgageId,
			principal: 250_000,
			status: "draft",
			title: "King West bridge opportunity",
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
		expect(firstResult.committedListingId).toBe(String(artifacts.listings[0]?._id));
	});

	it("commits canonically first and immediately activates provider-managed collections when the primary borrower bank account is ready", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const { identity: borrowerIdentity, userId } = await seedBorrowerUser(t, {
			email: "provider.now.borrower@test.fairlend.ca",
			subject: "user_provider_now_borrower",
		});
		const borrowerId = await seedBorrowerProfile(t, { userId });
		const bankAccountId = await seedValidatedBorrowerBankAccount(t, {
			borrowerId,
		});
		mockRotessaRecurringScheduleCreation();
		setWorkosProvisioningForTests(createProvisioningMock());

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			collectionsDraft: {
				mode: "provider_managed_now",
				providerCode: "pad_rotessa",
				selectedBankAccountId: bankAccountId,
			},
			primaryBorrowerEmail: borrowerIdentity.user_email,
			primaryBorrowerName: "Provider Managed Borrower",
		});

		const result = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);
		expect(result.status).toBe("committed");

		const artifacts = await t.run(async (ctx) => {
			const caseRecord = await ctx.db.get(caseId);
			const mortgage = await ctx.db.get(
				result.committedMortgageId as Id<"mortgages">
			);
			const schedules = await ctx.db
				.query("externalCollectionSchedules")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", result.committedMortgageId as Id<"mortgages">)
				)
				.collect();
			const planEntries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (query) =>
					query.eq("mortgageId", result.committedMortgageId as Id<"mortgages">)
				)
				.collect();

			return { caseRecord, mortgage, planEntries, schedules };
		});

		expect(artifacts.caseRecord?.collectionsDraft).toMatchObject({
			activationStatus: "active",
			providerCode: "pad_rotessa",
			selectedBankAccountId: bankAccountId,
		});
		expect(artifacts.caseRecord?.collectionsDraft?.retryCount).toBeUndefined();
		expect(artifacts.caseRecord?.collectionsDraft?.lastAttemptAt).toBeTypeOf(
			"number"
		);
		expect(artifacts.schedules).toHaveLength(1);
		expect(artifacts.schedules[0]).toMatchObject({
			bankAccountId,
			externalScheduleRef: "987",
			providerCode: "pad_rotessa",
			status: "active",
		});
		expect(artifacts.caseRecord?.collectionsDraft?.externalCollectionScheduleId).toBe(
			artifacts.schedules[0]?._id
		);
		expect(artifacts.mortgage).toMatchObject({
			activeExternalCollectionScheduleId: artifacts.schedules[0]?._id,
			collectionExecutionMode: "provider_managed",
			collectionExecutionProviderCode: "pad_rotessa",
		});
		const providerManagedEntries = artifacts.planEntries.filter(
			(entry) =>
				entry.executionMode === "provider_managed" &&
				entry.status === "provider_scheduled"
		);
		expect(providerManagedEntries.length).toBeGreaterThan(0);
		expect(
			providerManagedEntries.every(
				(entry) =>
					entry.externalCollectionScheduleId === artifacts.schedules[0]?._id
			)
		).toBe(true);
		expect(
			artifacts.planEntries.some(
				(entry) =>
					entry.executionMode === "app_owned" && entry.status === "planned"
			)
		).toBe(true);
	});

	it("keeps the mortgage committed and records durable collections activation failure when immediate Rotessa setup is incomplete", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const { identity: borrowerIdentity, userId } = await seedBorrowerUser(t, {
			email: "missing.bank.selection@test.fairlend.ca",
			subject: "user_missing_bank_selection",
		});
		await seedBorrowerProfile(t, { userId });
		setWorkosProvisioningForTests(createProvisioningMock());

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			collectionsDraft: {
				mode: "provider_managed_now",
				providerCode: "pad_rotessa",
			},
			primaryBorrowerEmail: borrowerIdentity.user_email,
			primaryBorrowerName: "Missing Bank Selection",
		});

		const result = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);
		expect(result.status).toBe("committed");

		const artifacts = await t.run(async (ctx) => {
			const caseRecord = await ctx.db.get(caseId);
			const mortgage = await ctx.db.get(
				result.committedMortgageId as Id<"mortgages">
			);
			const schedules = await ctx.db
				.query("externalCollectionSchedules")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", result.committedMortgageId as Id<"mortgages">)
				)
				.collect();

			return { caseRecord, mortgage, schedules };
		});

		expect(artifacts.caseRecord?.status).toBe("committed");
		expect(artifacts.caseRecord?.collectionsDraft).toMatchObject({
			activationStatus: "failed",
			providerCode: "pad_rotessa",
		});
		expect(artifacts.caseRecord?.collectionsDraft?.retryCount).toBeUndefined();
		expect(artifacts.caseRecord?.collectionsDraft?.lastError).toContain(
			"Select a primary borrower bank account"
		);
		expect(artifacts.mortgage?.collectionExecutionMode).toBe("app_owned");
		expect(artifacts.mortgage?.collectionExecutionProviderCode).toBeUndefined();
		expect(artifacts.mortgage?.activeExternalCollectionScheduleId).toBeUndefined();
		expect(artifacts.schedules).toHaveLength(0);
	});

	it("retries failed provider-managed activation from the committed mortgage surface", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const { identity: borrowerIdentity, userId } = await seedBorrowerUser(t, {
			email: "retry.provider.activation@test.fairlend.ca",
			subject: "user_retry_provider_activation",
		});
		const borrowerId = await seedBorrowerProfile(t, { userId });
		setWorkosProvisioningForTests(createProvisioningMock());

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			collectionsDraft: {
				mode: "provider_managed_now",
				providerCode: "pad_rotessa",
			},
			primaryBorrowerEmail: borrowerIdentity.user_email,
			primaryBorrowerName: "Retry Activation Borrower",
		});

		const committedResult = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);
		expect(committedResult.status).toBe("committed");

		const bankAccountId = await seedValidatedBorrowerBankAccount(t, {
			borrowerId,
		});
		await t.run(async (ctx) => {
			const caseRecord = await ctx.db.get(caseId);
			if (!caseRecord?.collectionsDraft) {
				throw new Error("Expected committed origination case draft");
			}

			await ctx.db.patch(caseId, {
				collectionsDraft: {
					...caseRecord.collectionsDraft,
					selectedBankAccountId: bankAccountId,
				},
				updatedAt: caseRecord.updatedAt + 1,
			});
		});

		mockRotessaRecurringScheduleCreation();
		const retryResult = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.collections.retryCollectionsActivation,
			{ caseId }
		);
		if (retryResult.status === "failed") {
			throw new Error(retryResult.message);
		}
		expect(retryResult.status).toBe("active");

		const artifacts = await t.run(async (ctx) => {
			const caseRecord = await ctx.db.get(caseId);
			const mortgage = await ctx.db.get(
				committedResult.committedMortgageId as Id<"mortgages">
			);
			const schedules = await ctx.db
				.query("externalCollectionSchedules")
				.withIndex("by_mortgage", (query) =>
					query.eq(
						"mortgageId",
						committedResult.committedMortgageId as Id<"mortgages">
					)
				)
				.collect();

			return { caseRecord, mortgage, schedules };
		});

		expect(artifacts.caseRecord?.collectionsDraft).toMatchObject({
			activationStatus: "active",
			retryCount: 1,
			selectedBankAccountId: bankAccountId,
		});
		expect(artifacts.caseRecord?.collectionsDraft?.lastError).toBeUndefined();
		expect(artifacts.schedules).toHaveLength(1);
		expect(artifacts.mortgage).toMatchObject({
			activeExternalCollectionScheduleId: artifacts.schedules[0]?._id,
			collectionExecutionMode: "provider_managed",
			collectionExecutionProviderCode: "pad_rotessa",
		});
	});

	it("uses the active schedule rule for payment bootstrap when one exists", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const { identity: borrowerIdentity } = await seedBorrowerUser(t, {
			email: "schedule.rule.borrower@test.fairlend.ca",
			subject: "user_schedule_rule_borrower",
		});
		await seedActiveScheduleRule(t, { delayDays: 9 });
		setWorkosProvisioningForTests(createProvisioningMock());

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			primaryBorrowerEmail: borrowerIdentity.user_email,
			primaryBorrowerName: "Schedule Rule Borrower",
		});

		const result = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);
		expect(result.status).toBe("committed");

		const paymentArtifacts = await t.run(async (ctx) => {
			const mortgage = await ctx.db.get(result.committedMortgageId as Id<"mortgages">);
			const obligations = await ctx.db
				.query("obligations")
				.withIndex("by_mortgage_and_date", (query) =>
					query.eq("mortgageId", result.committedMortgageId as Id<"mortgages">)
				)
				.collect();
			const collectionPlanEntries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (query) =>
					query.eq("mortgageId", result.committedMortgageId as Id<"mortgages">)
				)
				.collect();
			return { collectionPlanEntries, mortgage, obligations };
		});

		expect(paymentArtifacts.mortgage?.paymentBootstrapScheduleRuleMissing).toBe(
			false
		);
		expect(paymentArtifacts.collectionPlanEntries).toHaveLength(
			paymentArtifacts.obligations.length
		);
		const firstInterestObligation = [...paymentArtifacts.obligations].sort(
			(left, right) => left.dueDate - right.dueDate
		)[0];
		const firstPlanEntry = [...paymentArtifacts.collectionPlanEntries].sort(
			(left, right) => left.scheduledDate - right.scheduledDate
		)[0];
		expect(firstInterestObligation).toBeDefined();
		expect(firstPlanEntry).toBeDefined();
		expect(firstPlanEntry?.scheduledDate).toBe(
			(firstInterestObligation?.dueDate ?? 0) - 9 * 86_400_000
		);
	});

	it("backfills a missing listing projection when recommitting an already activated mortgage", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const { identity: borrowerIdentity } = await seedBorrowerUser(t);
		setWorkosProvisioningForTests(createProvisioningMock());

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			listingOverrides: {
				description: "Replay-safe curated description",
				title: "Replay-safe curated title",
			},
			primaryBorrowerEmail: borrowerIdentity.user_email,
			primaryBorrowerName: "Ada Borrower",
		});

		const firstResult = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);
		if (firstResult.status !== "committed" || !firstResult.committedListingId) {
			throw new Error("Expected initial commit to create a listing");
		}

		await t.run(async (ctx) => {
			await ctx.db.delete(firstResult.committedListingId as Id<"listings">);
			const caseRecord = await ctx.db.get(caseId);
			if (!caseRecord) {
				throw new Error("Case disappeared before replay setup");
			}

			await ctx.db.patch(caseId, {
				committedAt: undefined,
				committedListingId: undefined,
				committedMortgageId: undefined,
				committedValuationSnapshotId: undefined,
				status: "ready_to_commit",
				updatedAt: caseRecord.updatedAt + 1,
			});
		});

		const replayResult = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);

		expect(replayResult).toMatchObject({
			committedMortgageId: firstResult.committedMortgageId,
			status: "committed",
			wasAlreadyCommitted: true,
		});
		expect(replayResult.committedListingId).toBeTruthy();

		const replayArtifacts = await t.run(async (ctx) => {
			const caseRecord = await ctx.db.get(caseId);
			const listings = await ctx.db
				.query("listings")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", firstResult.committedMortgageId as Id<"mortgages">)
				)
				.collect();

			return { caseRecord, listings };
		});

		expect(replayArtifacts.listings).toHaveLength(1);
		expect(replayArtifacts.listings[0]).toMatchObject({
			dataSource: "mortgage_pipeline",
			description: "Replay-safe curated description",
			mortgageId: firstResult.committedMortgageId,
			title: "Replay-safe curated title",
		});
		expect(replayArtifacts.caseRecord).toMatchObject({
			committedListingId: replayResult.committedListingId,
			committedMortgageId: firstResult.committedMortgageId,
			status: "committed",
		});
	});

	it("backfills missing obligations and plan entries when recommitting an already activated mortgage", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const { identity: borrowerIdentity } = await seedBorrowerUser(t, {
			email: "payment.replay.borrower@test.fairlend.ca",
			subject: "user_payment_replay_borrower",
		});
		setWorkosProvisioningForTests(createProvisioningMock());

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			primaryBorrowerEmail: borrowerIdentity.user_email,
			primaryBorrowerName: "Payment Replay Borrower",
		});

		const firstResult = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);
		if (firstResult.status !== "committed") {
			throw new Error("Expected initial commit to finish before replay setup");
		}

		await t.run(async (ctx) => {
			const mortgageId = firstResult.committedMortgageId as Id<"mortgages">;
			const obligations = await ctx.db
				.query("obligations")
				.withIndex("by_mortgage_and_date", (query) =>
					query.eq("mortgageId", mortgageId)
				)
				.collect();
			const collectionPlanEntries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (query) =>
					query.eq("mortgageId", mortgageId)
				)
				.collect();
			for (const entry of collectionPlanEntries) {
				await ctx.db.delete(entry._id);
			}
			for (const obligation of obligations) {
				await ctx.db.delete(obligation._id);
			}

			const caseRecord = await ctx.db.get(caseId);
			if (!caseRecord) {
				throw new Error("Case disappeared before payment replay setup");
			}

			await ctx.db.patch(mortgageId, {
				paymentBootstrapScheduleRuleMissing: undefined,
			});
			await ctx.db.patch(caseId, {
				committedAt: undefined,
				committedListingId: undefined,
				committedMortgageId: undefined,
				committedValuationSnapshotId: undefined,
				status: "ready_to_commit",
				updatedAt: caseRecord.updatedAt + 1,
			});
		});

		const replayResult = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);

		expect(replayResult).toMatchObject({
			committedMortgageId: firstResult.committedMortgageId,
			status: "committed",
			wasAlreadyCommitted: true,
		});

		const replayArtifacts = await t.run(async (ctx) => {
			const mortgageId = firstResult.committedMortgageId as Id<"mortgages">;
			const mortgage = await ctx.db.get(mortgageId);
			const obligations = await ctx.db
				.query("obligations")
				.withIndex("by_mortgage_and_date", (query) =>
					query.eq("mortgageId", mortgageId)
				)
				.collect();
			const collectionPlanEntries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (query) =>
					query.eq("mortgageId", mortgageId)
				)
				.collect();
			return { collectionPlanEntries, mortgage, obligations };
		});

		expect(replayArtifacts.obligations).toHaveLength(12);
		expect(replayArtifacts.collectionPlanEntries).toHaveLength(12);
		expect(replayArtifacts.mortgage?.paymentBootstrapScheduleRuleMissing).toBe(
			true
		);
	});

	it("reports only replay-created payment artifact ids for already committed mortgages", async () => {
		const t = createTestConvex();
		await ensureSeededIdentity(t, FAIRLEND_ADMIN);
		const brokerOfRecordId = await seedBrokerRecord(t);
		const { identity: borrowerIdentity } = await seedBorrowerUser(t, {
			email: "created-ids.borrower@test.fairlend.ca",
			subject: "user_created_ids_borrower",
		});
		setWorkosProvisioningForTests(createProvisioningMock());

		const caseId = await stageCommitReadyCase(t, {
			brokerOfRecordId,
			primaryBorrowerEmail: borrowerIdentity.user_email,
			primaryBorrowerName: "Created Ids Borrower",
		});

		const firstResult = await t.withIdentity(FAIRLEND_ADMIN).action(
			api.admin.origination.commit.commitCase,
			{ caseId }
		);
		if (firstResult.status !== "committed") {
			throw new Error("Expected initial commit to finish before replay checks");
		}

		const replayBase = await t.run(async (ctx) => {
			const caseRecord = await ctx.db.get(caseId);
			const viewer = await ctx.db
				.query("users")
				.filter((query) => query.eq(query.field("authId"), FAIRLEND_ADMIN.subject))
				.first();
			const mortgageId = firstResult.committedMortgageId as Id<"mortgages">;
			const mortgage = await ctx.db.get(mortgageId);
			const borrowerLinks = await ctx.db
				.query("mortgageBorrowers")
				.withIndex("by_mortgage", (query) => query.eq("mortgageId", mortgageId))
				.collect();

			if (!caseRecord?.mortgageDraft || !caseRecord.propertyDraft) {
				throw new Error("Expected staged mortgage and property drafts");
			}
			if (!viewer) {
				throw new Error("Expected seeded admin viewer");
			}
			if (!mortgage) {
				throw new Error("Expected committed mortgage");
			}

			return {
				borrowerLinks: borrowerLinks.map((link) => ({
					borrowerId: link.borrowerId,
					role: link.role,
				})),
				caseRecord,
				mortgageId,
				viewerUserId: viewer._id,
				brokerOfRecordId: mortgage.brokerOfRecordId,
			};
		});

		const buildReplayArgs = () => ({
			actorAuthId: FAIRLEND_ADMIN.subject,
			actorType: "admin" as const,
			borrowerLinks: replayBase.borrowerLinks,
			brokerOfRecordId: replayBase.brokerOfRecordId,
			collectionsDraft: replayBase.caseRecord.collectionsDraft,
			listingOverrides: replayBase.caseRecord.listingOverrides,
			mortgageDraft: replayBase.caseRecord.mortgageDraft,
			now: Date.now(),
			orgId: replayBase.caseRecord.orgId,
			propertyDraft: replayBase.caseRecord.propertyDraft,
			source: buildAdminDirectMortgageActivationSource({
				caseId,
				viewerUserId: replayBase.viewerUserId,
			}),
			stagedCaseStatus: replayBase.caseRecord.status,
			valuationDraft: replayBase.caseRecord.valuationDraft,
			viewerUserId: replayBase.viewerUserId,
		});

		const noOpReplayResult = await t.run(async (ctx) =>
			activateMortgageAggregate(ctx as unknown as MutationCtx, buildReplayArgs())
		);

		expect(noOpReplayResult.wasAlreadyCommitted).toBe(true);
		expect(noOpReplayResult.createdObligationIds).toEqual([]);
		expect(noOpReplayResult.createdPlanEntryIds).toEqual([]);

		await t.run(async (ctx) => {
			const entries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (query) =>
					query.eq("mortgageId", replayBase.mortgageId)
				)
				.collect();
			const firstEntryId = entries[0]?._id;
			if (!firstEntryId) {
				throw new Error("Expected an existing collection plan entry");
			}
			await ctx.db.delete(firstEntryId);
		});

		const replayAfterDeletion = await t.run(async (ctx) =>
			activateMortgageAggregate(ctx as unknown as MutationCtx, buildReplayArgs())
		);

		expect(replayAfterDeletion.wasAlreadyCommitted).toBe(true);
		expect(replayAfterDeletion.createdObligationIds).toEqual([]);
		expect(replayAfterDeletion.createdPlanEntryIds).toHaveLength(1);

		const replayArtifacts = await t.run(async (ctx) => {
			const collectionPlanEntries = await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (query) =>
					query.eq("mortgageId", replayBase.mortgageId)
				)
				.collect();
			return { collectionPlanEntries };
		});

		expect(replayArtifacts.collectionPlanEntries).toHaveLength(12);
		expect(
			replayArtifacts.collectionPlanEntries.some(
				(entry) => entry._id === replayAfterDeletion.createdPlanEntryIds[0]
			)
		).toBe(true);
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
		expect(after.listings).toBe(before.listings + 1);
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
