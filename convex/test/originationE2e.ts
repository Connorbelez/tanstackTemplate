import { ConvexError, v } from "convex/values";
import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { FAIRLEND_STAFF_ORG_ID } from "../constants";
import { adminMutation } from "../fluent";

async function deleteByIds<TableName extends TableNames>(
	ctx: Pick<MutationCtx, "db">,
	ids: readonly Id<TableName>[]
) {
	for (const id of ids) {
		await ctx.db.delete(id);
	}
	return ids.length;
}

async function deleteRows<T extends { _id: Id<TableNames> }>(
	ctx: Pick<MutationCtx, "db">,
	rows: readonly T[]
) {
	for (const row of rows) {
		await ctx.db.delete(row._id);
	}
	return rows.length;
}

async function ensureActiveBrokerOfRecord(ctx: MutationCtx) {
	const existingBroker = await ctx.db
		.query("brokers")
		.withIndex("by_org_status", (query) =>
			query.eq("orgId", FAIRLEND_STAFF_ORG_ID).eq("status", "active")
		)
		.first();
	if (existingBroker) {
		return existingBroker._id;
	}

	const users = await ctx.db.query("users").collect();
	const brokerUser = users[0];
	if (!brokerUser) {
		throw new ConvexError("No synced users are available for origination e2e");
	}

	const now = Date.now();
	return ctx.db.insert("brokers", {
		createdAt: now,
		lastTransitionAt: now,
		onboardedAt: now,
		orgId: FAIRLEND_STAFF_ORG_ID,
		status: "active",
		userId: brokerUser._id,
	});
}

async function ensureActiveBorrower(
	ctx: MutationCtx,
	brokerUserId?: Id<"users">
) {
	const existingBorrower = await ctx.db
		.query("borrowers")
		.withIndex("by_org_status", (query) =>
			query.eq("orgId", FAIRLEND_STAFF_ORG_ID).eq("status", "active")
		)
		.first();
	if (existingBorrower) {
		return existingBorrower._id;
	}

	const users = await ctx.db.query("users").collect();
	const borrowerUser =
		users.find((user) => user._id !== brokerUserId) ?? users[0] ?? null;
	if (!borrowerUser) {
		throw new ConvexError("No synced users are available for origination e2e");
	}

	const now = Date.now();
	return ctx.db.insert("borrowers", {
		createdAt: now,
		creationSource: "e2e_seed",
		lastTransitionAt: now,
		onboardedAt: now,
		orgId: FAIRLEND_STAFF_ORG_ID,
		originatingWorkflowId: "origination-e2e-seed",
		originatingWorkflowType: "e2e_seed",
		status: "active",
		userId: borrowerUser._id,
		workflowSourceId: "origination-e2e-seed",
		workflowSourceKey: "origination-e2e-seed-borrower",
		workflowSourceType: "e2e_seed",
	});
}

export const ensureOriginationE2eContext = adminMutation
	.handler(async (ctx) => {
		const brokerOfRecordId = await ensureActiveBrokerOfRecord(ctx);
		const broker = await ctx.db.get(brokerOfRecordId);
		if (!broker) {
			throw new ConvexError("Broker seed disappeared during origination e2e");
		}

		const borrowerId = await ensureActiveBorrower(ctx, broker.userId);

		return {
			borrowerId,
			brokerOfRecordId,
		};
	})
	.public();

async function loadCommittedOriginationArtifacts(
	ctx: Pick<QueryCtx, "db">,
	caseId: Id<"adminOriginationCases">
) {
	const caseRecord = await ctx.db.get(caseId);
	const documentDrafts = await ctx.db
		.query("originationCaseDocumentDrafts")
		.withIndex("by_case", (query) => query.eq("caseId", caseId))
		.collect();

	const committedListingId = caseRecord?.committedListingId ?? null;
	const committedMortgageId = caseRecord?.committedMortgageId ?? null;
	const committedListing = committedListingId
		? await ctx.db.get(committedListingId)
		: null;
	const committedMortgage = committedMortgageId
		? await ctx.db.get(committedMortgageId)
		: null;
	const propertyId = committedMortgage?.propertyId ?? null;
	const mortgageBorrowerLinks = committedMortgageId
		? await ctx.db
				.query("mortgageBorrowers")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", committedMortgageId)
				)
				.collect()
		: [];
	const borrowerRecords = committedMortgageId
		? await Promise.all(
				mortgageBorrowerLinks.map(async (link) => ({
					borrower: await ctx.db.get(link.borrowerId),
					link,
				}))
			)
		: [];
	const valuationSnapshots = committedMortgageId
		? await ctx.db
				.query("mortgageValuationSnapshots")
				.withIndex("by_mortgage_created_at", (query) =>
					query.eq("mortgageId", committedMortgageId)
				)
				.collect()
		: [];
	const obligationRows = committedMortgageId
		? await ctx.db
				.query("obligations")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", committedMortgageId)
				)
				.collect()
		: [];
	const collectionPlanEntries = committedMortgageId
		? await ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (query) =>
					query.eq("mortgageId", committedMortgageId)
				)
				.collect()
		: [];
	const collectionAttempts = committedMortgageId
		? await ctx.db
				.query("collectionAttempts")
				.withIndex("by_mortgage_status", (query) =>
					query.eq("mortgageId", committedMortgageId)
				)
				.collect()
		: [];
	const transferRequests = committedMortgageId
		? await ctx.db
				.query("transferRequests")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", committedMortgageId)
				)
				.collect()
		: [];
	const dispersalEntries = committedMortgageId
		? await ctx.db
				.query("dispersalEntries")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", committedMortgageId)
				)
				.collect()
		: [];
	const servicingFeeEntries = committedMortgageId
		? await ctx.db
				.query("servicingFeeEntries")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", committedMortgageId)
				)
				.collect()
		: [];
	const cashLedgerEntries = committedMortgageId
		? await ctx.db
				.query("cash_ledger_journal_entries")
				.withIndex("by_mortgage_and_sequence", (query) =>
					query.eq("mortgageId", committedMortgageId)
				)
				.collect()
		: [];
	const cashLedgerAccounts = committedMortgageId
		? await ctx.db
				.query("cash_ledger_accounts")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", committedMortgageId)
				)
				.collect()
		: [];
	const auditJournalEntries = committedMortgageId
		? await ctx.db
				.query("auditJournal")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", String(committedMortgageId))
				)
				.collect()
		: [];
	const ledgerReservations = committedMortgageId
		? await ctx.db
				.query("ledger_reservations")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", String(committedMortgageId))
				)
				.collect()
		: [];
	const ledgerEntries = committedMortgageId
		? await ctx.db
				.query("ledger_journal_entries")
				.withIndex("by_mortgage_and_time", (query) =>
					query.eq("mortgageId", String(committedMortgageId))
				)
				.collect()
		: [];
	const ledgerAccounts = committedMortgageId
		? await ctx.db
				.query("ledger_accounts")
				.withIndex("by_mortgage", (query) =>
					query.eq("mortgageId", String(committedMortgageId))
				)
				.collect()
		: [];
	const appraisalRows = propertyId
		? (
				await Promise.all(
					valuationSnapshots.map((snapshot) =>
						ctx.db
							.query("appraisals")
							.withIndex("by_property_and_date", (query) =>
								query
									.eq("propertyId", propertyId)
									.eq("effectiveDate", snapshot.valuationDate)
							)
							.collect()
					)
				)
			)
				.flat()
				.filter(
					(appraisal) =>
						appraisal.appraiserFirm === "FairLend" &&
						appraisal.appraiserName === "FairLend Origination Workspace"
				)
		: [];
	const appraisalComparables = appraisalRows.length
		? (
				await Promise.all(
					appraisalRows.map((appraisal) =>
						ctx.db
							.query("appraisalComparables")
							.withIndex("by_appraisal", (query) =>
								query.eq("appraisalId", appraisal._id)
							)
							.collect()
					)
				)
			).flat()
		: [];

	return {
		appraisalComparables,
		appraisalRows,
		auditJournalEntries,
		borrowerRecords,
		caseRecord,
		cashLedgerAccounts,
		cashLedgerEntries,
		collectionAttempts,
		collectionPlanEntries,
		committedListing,
		committedListingId,
		committedMortgage,
		committedMortgageId,
		dispersalEntries,
		documentDrafts,
		ledgerAccounts,
		ledgerEntries,
		ledgerReservations,
		mortgageBorrowerLinks,
		obligationRows,
		propertyId,
		servicingFeeEntries,
		transferRequests,
		valuationSnapshots,
	};
}

async function deleteCaseOwnedBorrowers(
	ctx: Pick<MutationCtx, "db">,
	args: {
		borrowerRecords: Awaited<
			ReturnType<typeof loadCommittedOriginationArtifacts>
		>["borrowerRecords"];
		caseId: Id<"adminOriginationCases">;
	}
) {
	let deletedBorrowers = 0;
	for (const entry of args.borrowerRecords) {
		const borrower = entry.borrower;
		if (!borrower) {
			continue;
		}

		const remainingLinks = await ctx.db
			.query("mortgageBorrowers")
			.withIndex("by_borrower", (query) => query.eq("borrowerId", borrower._id))
			.collect();
		if (remainingLinks.length > 0) {
			continue;
		}

		const isCaseOwnedBorrower =
			borrower.creationSource === "admin_direct" &&
			borrower.originatingWorkflowId === String(args.caseId) &&
			borrower.originatingWorkflowType === "admin_origination_case";
		if (!isCaseOwnedBorrower) {
			continue;
		}

		await ctx.db.delete(borrower._id);
		deletedBorrowers += 1;
	}

	return deletedBorrowers;
}

async function deleteCommittedMortgageRecord(
	ctx: Pick<MutationCtx, "db">,
	committedMortgageId: Id<"mortgages"> | null
) {
	if (!committedMortgageId) {
		return 0;
	}

	const mortgage = await ctx.db.get(committedMortgageId);
	if (!mortgage) {
		return 0;
	}

	await ctx.db.delete(committedMortgageId);
	return 1;
}

async function deleteCommittedListingRecord(
	ctx: Pick<MutationCtx, "db">,
	committedListingId: Id<"listings"> | null
) {
	if (!committedListingId) {
		return 0;
	}

	const listing = await ctx.db.get(committedListingId);
	if (!listing) {
		return 0;
	}

	await ctx.db.delete(committedListingId);
	return 1;
}

async function deleteOrphanedCommittedProperty(
	ctx: Pick<MutationCtx, "db">,
	args: Pick<
		Awaited<ReturnType<typeof loadCommittedOriginationArtifacts>>,
		"caseRecord" | "committedMortgage" | "propertyId"
	>
) {
	if (
		!(args.propertyId && args.committedMortgage) ||
		args.caseRecord?.propertyDraft?.propertyId
	) {
		return 0;
	}

	const propertyId = args.propertyId;
	const remainingMortgages = await ctx.db
		.query("mortgages")
		.withIndex("by_property", (query) => query.eq("propertyId", propertyId))
		.collect();
	if (remainingMortgages.length > 0) {
		return 0;
	}

	await ctx.db.delete(propertyId);
	return 1;
}

async function cleanupCommittedOriginationArtifacts(
	ctx: MutationCtx,
	caseId: Id<"adminOriginationCases">,
	artifacts: Awaited<ReturnType<typeof loadCommittedOriginationArtifacts>>
) {
	const deletedDocumentDrafts = await deleteByIds(
		ctx,
		artifacts.documentDrafts.map((draft) => draft._id)
	);
	const deletedAppraisalComparables = await deleteByIds(
		ctx,
		artifacts.appraisalComparables.map((comparable) => comparable._id)
	);
	const deletedAppraisals = await deleteByIds(
		ctx,
		artifacts.appraisalRows.map((appraisal) => appraisal._id)
	);
	const deletedCashLedgerEntries = await deleteByIds(
		ctx,
		artifacts.cashLedgerEntries.map((entry) => entry._id)
	);
	const deletedCashLedgerAccounts = await deleteByIds(
		ctx,
		artifacts.cashLedgerAccounts.map((account) => account._id)
	);
	const deletedCollectionAttempts = await deleteByIds(
		ctx,
		artifacts.collectionAttempts.map((attempt) => attempt._id)
	);
	const deletedCollectionPlanEntries = await deleteByIds(
		ctx,
		artifacts.collectionPlanEntries.map((entry) => entry._id)
	);
	const deletedTransferRequests = await deleteByIds(
		ctx,
		artifacts.transferRequests.map((request) => request._id)
	);
	const deletedDispersalEntries = await deleteByIds(
		ctx,
		artifacts.dispersalEntries.map((entry) => entry._id)
	);
	const deletedServicingFeeEntries = await deleteByIds(
		ctx,
		artifacts.servicingFeeEntries.map((entry) => entry._id)
	);
	const deletedObligations = await deleteByIds(
		ctx,
		artifacts.obligationRows.map((obligation) => obligation._id)
	);
	const deletedAuditJournalEntries = await deleteByIds(
		ctx,
		artifacts.auditJournalEntries.map((entry) => entry._id)
	);
	const deletedLedgerReservations = await deleteRows(
		ctx,
		artifacts.ledgerReservations
	);
	const deletedLedgerEntries = await deleteByIds(
		ctx,
		artifacts.ledgerEntries.map((entry) => entry._id)
	);
	const deletedLedgerAccounts = await deleteByIds(
		ctx,
		artifacts.ledgerAccounts.map((account) => account._id)
	);
	const deletedMortgageBorrowers = await deleteByIds(
		ctx,
		artifacts.mortgageBorrowerLinks.map((link) => link._id)
	);
	const deletedValuationSnapshots = await deleteByIds(
		ctx,
		artifacts.valuationSnapshots.map((snapshot) => snapshot._id)
	);
	const deletedBorrowers = await deleteCaseOwnedBorrowers(ctx, {
		borrowerRecords: artifacts.borrowerRecords,
		caseId,
	});
	const deletedListing = await deleteCommittedListingRecord(
		ctx,
		artifacts.committedListingId
	);
	const deletedMortgage = await deleteCommittedMortgageRecord(
		ctx,
		artifacts.committedMortgageId
	);
	const deletedProperty = await deleteOrphanedCommittedProperty(ctx, {
		caseRecord: artifacts.caseRecord,
		committedMortgage: artifacts.committedMortgage,
		propertyId: artifacts.propertyId,
	});

	let deletedCase = 0;
	if (artifacts.caseRecord) {
		await ctx.db.delete(caseId);
		deletedCase = 1;
	}

	return {
		deletedAppraisalComparables,
		deletedAppraisals,
		deletedAuditJournalEntries,
		deletedBorrowers,
		deletedCashLedgerAccounts,
		deletedCashLedgerEntries,
		deletedCase,
		deletedCollectionAttempts,
		deletedCollectionPlanEntries,
		deletedDispersalEntries,
		deletedDocumentDrafts,
		deletedLedgerAccounts,
		deletedLedgerEntries,
		deletedLedgerReservations,
		deletedListing,
		deletedMortgage,
		deletedMortgageBorrowers,
		deletedObligations,
		deletedProperty,
		deletedServicingFeeEntries,
		deletedTransferRequests,
		deletedValuationSnapshots,
	};
}

export const cleanupCommittedOrigination = adminMutation
	.input({
		caseId: v.id("adminOriginationCases"),
	})
	.handler(async (ctx, args) => {
		const artifacts = await loadCommittedOriginationArtifacts(ctx, args.caseId);
		return cleanupCommittedOriginationArtifacts(ctx, args.caseId, artifacts);
	})
	.public();
