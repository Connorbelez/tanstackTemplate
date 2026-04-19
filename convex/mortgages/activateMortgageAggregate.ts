import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { materializeMortgageBlueprintsFromCaseDrafts } from "../documents/mortgageBlueprints";
import { appendAuditJournalEntry } from "../engine/auditJournal";
import { mintMortgageHandler } from "../ledger/mutations";
import {
	toListingProjectionOverrides,
	upsertMortgageListingProjection,
} from "../listings/projection";
import { bootstrapOriginationPayments } from "../payments/origination/bootstrap";
import {
	ensureMortgageBorrowerLink,
	findPropertyByAddress,
} from "../seed/seedHelpers";
import {
	type MortgageActivationSource,
	ORIGINATION_WORKFLOW_SOURCE_TYPE,
} from "./provenance";
import { createOriginationValuationSnapshot } from "./valuation";

function toBusinessDate(timestamp: number) {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function requireValue<T>(
	value: T | null | undefined,
	message: string
): Exclude<T, null | undefined> {
	if (value === null || value === undefined) {
		throw new ConvexError(message);
	}

	return value as Exclude<T, null | undefined>;
}

function requireMortgageActivationInputs(
	mortgageDraft: NonNullable<Doc<"adminOriginationCases">["mortgageDraft"]>
) {
	return {
		amortizationMonths: requireValue(
			mortgageDraft.amortizationMonths,
			"Amortization is required."
		),
		firstPaymentDate: requireValue(
			mortgageDraft.firstPaymentDate,
			"First payment date is required."
		),
		interestAdjustmentDate: requireValue(
			mortgageDraft.interestAdjustmentDate,
			"Interest adjustment date is required."
		),
		interestRate: requireValue(
			mortgageDraft.interestRate,
			"Interest rate is required."
		),
		lienPosition: requireValue(
			mortgageDraft.lienPosition,
			"Lien position is required."
		),
		loanType: requireValue(mortgageDraft.loanType, "Loan type is required."),
		maturityDate: requireValue(
			mortgageDraft.maturityDate,
			"Maturity date is required."
		),
		paymentAmount: requireValue(
			mortgageDraft.paymentAmount,
			"Payment amount is required."
		),
		paymentFrequency: requireValue(
			mortgageDraft.paymentFrequency,
			"Payment frequency is required."
		),
		principal: requireValue(mortgageDraft.principal, "Principal is required."),
		rateType: requireValue(mortgageDraft.rateType, "Rate type is required."),
		termMonths: requireValue(
			mortgageDraft.termMonths,
			"Term length is required."
		),
		termStartDate: requireValue(
			mortgageDraft.termStartDate,
			"Term start date is required."
		),
	};
}

async function resolveCanonicalProperty(
	ctx: Pick<MutationCtx, "db">,
	args: {
		now: number;
		propertyDraft: NonNullable<Doc<"adminOriginationCases">["propertyDraft"]>;
	}
) {
	if (args.propertyDraft.propertyId) {
		const property = await ctx.db.get(args.propertyDraft.propertyId);
		if (!property) {
			throw new ConvexError("Selected property no longer exists");
		}
		return { propertyId: property._id, wasCreated: false };
	}

	const createDraft = args.propertyDraft.create;
	if (
		!(
			createDraft?.streetAddress &&
			createDraft.city &&
			createDraft.postalCode &&
			createDraft.propertyType &&
			createDraft.province
		)
	) {
		throw new ConvexError("Origination property staging is incomplete");
	}

	const existing = await findPropertyByAddress(ctx, {
		postalCode: createDraft.postalCode,
		streetAddress: createDraft.streetAddress,
		unit: createDraft.unit,
	});
	if (
		existing &&
		existing.city === createDraft.city &&
		existing.province === createDraft.province &&
		existing.propertyType === createDraft.propertyType
	) {
		return { propertyId: existing._id, wasCreated: false };
	}

	const propertyId = await ctx.db.insert("properties", {
		streetAddress: createDraft.streetAddress,
		unit: createDraft.unit,
		city: createDraft.city,
		province: createDraft.province,
		postalCode: createDraft.postalCode,
		googlePlaceData: createDraft.googlePlaceData,
		propertyType: createDraft.propertyType,
		latitude: createDraft.approximateLatitude,
		longitude: createDraft.approximateLongitude,
		createdAt: args.now,
	});

	return { propertyId, wasCreated: true };
}

function dedupeBorrowerIds(
	borrowerLinks: ReadonlyArray<{ borrowerId: Id<"borrowers"> }>
) {
	return [...new Set(borrowerLinks.map((link) => link.borrowerId))];
}

function resolvePrimaryBorrowerId(
	borrowerLinks: ReadonlyArray<{
		borrowerId: Id<"borrowers">;
		role: Doc<"mortgageBorrowers">["role"];
	}>
) {
	return (
		borrowerLinks.find((link) => link.role === "primary")?.borrowerId ??
		borrowerLinks[0]?.borrowerId ??
		null
	);
}

async function readMortgageBorrowerLinks(
	ctx: Pick<MutationCtx, "db">,
	mortgageId: Id<"mortgages">
) {
	return ctx.db
		.query("mortgageBorrowers")
		.withIndex("by_mortgage", (query) => query.eq("mortgageId", mortgageId))
		.collect();
}

async function readExistingActivationResult(
	ctx: Pick<MutationCtx, "db">,
	existingMortgage: Doc<"mortgages">,
	paymentBootstrap: Pick<
		ActivateMortgageAggregateResult,
		"createdObligationIds" | "createdPlanEntryIds" | "scheduleRuleMissing"
	>
): Promise<ActivateMortgageAggregateResult> {
	const [
		borrowerLinks,
		listing,
		planEntries,
		obligations,
		valuationSnapshot,
		documentBlueprints,
	] = await Promise.all([
		readMortgageBorrowerLinks(ctx, existingMortgage._id),
		ctx.db
			.query("listings")
			.withIndex("by_mortgage", (query) =>
				query.eq("mortgageId", existingMortgage._id)
			)
			.unique(),
		ctx.db
			.query("collectionPlanEntries")
			.withIndex("by_mortgage_status_scheduled", (query) =>
				query.eq("mortgageId", existingMortgage._id)
			)
			.collect(),
		ctx.db
			.query("obligations")
			.withIndex("by_mortgage_and_date", (query) =>
				query.eq("mortgageId", existingMortgage._id)
			)
			.collect(),
		ctx.db
			.query("mortgageValuationSnapshots")
			.withIndex("by_mortgage_created_at", (query) =>
				query.eq("mortgageId", existingMortgage._id)
			)
			.order("desc")
			.first(),
		ctx.db
			.query("mortgageDocumentBlueprints")
			.withIndex("by_mortgage_status_class", (query) =>
				query.eq("mortgageId", existingMortgage._id).eq("status", "active")
			)
			.collect(),
	]);

	const sortedPlanEntryIds = [...planEntries]
		.sort((left, right) => left.scheduledDate - right.scheduledDate)
		.map((entry) => entry._id);
	const sortedObligationIds = [...obligations]
		.sort((left, right) => left.dueDate - right.dueDate)
		.map((obligation) => obligation._id);
	const borrowerIds = dedupeBorrowerIds(borrowerLinks);
	const primaryBorrowerLink =
		borrowerLinks.find((link) => link.role === "primary") ?? borrowerLinks[0];

	return {
		borrowerIds,
		createdObligationIds: sortedObligationIds,
		createdPlanEntryIds: sortedPlanEntryIds,
		dealBlueprintCount: documentBlueprints.filter(
			(blueprint) => blueprint.class !== "public_static"
		).length,
		listingId: listing?._id ?? null,
		mortgageId: existingMortgage._id,
		primaryBorrowerId: primaryBorrowerLink?.borrowerId ?? null,
		propertyId: existingMortgage.propertyId,
		publicBlueprintCount: documentBlueprints.filter(
			(blueprint) => blueprint.class === "public_static"
		).length,
		scheduleRuleMissing:
			existingMortgage.paymentBootstrapScheduleRuleMissing ??
			paymentBootstrap.scheduleRuleMissing,
		valuationSnapshotId: valuationSnapshot?._id ?? null,
		wasAlreadyCommitted: true,
	};
}

async function ensureReplaySafePaymentBootstrap(
	ctx: MutationCtx,
	args: Pick<ActivateMortgageAggregateInput, "now" | "orgId"> & {
		existingMortgage: Doc<"mortgages">;
	}
) {
	const [borrowerLinks, existingObligations, existingPlanEntries] =
		await Promise.all([
			readMortgageBorrowerLinks(ctx, args.existingMortgage._id),
			ctx.db
				.query("obligations")
				.withIndex("by_mortgage_and_date", (query) =>
					query.eq("mortgageId", args.existingMortgage._id)
				)
				.collect(),
			ctx.db
				.query("collectionPlanEntries")
				.withIndex("by_mortgage_status_scheduled", (query) =>
					query.eq("mortgageId", args.existingMortgage._id)
				)
				.collect(),
		]);
	const primaryBorrowerId = resolvePrimaryBorrowerId(borrowerLinks);
	if (!primaryBorrowerId) {
		throw new ConvexError(
			`Mortgage ${args.existingMortgage._id} is missing a primary borrower link for payment bootstrap replay.`
		);
	}

	const paymentBootstrap = await bootstrapOriginationPayments(ctx, {
		firstPaymentDate: args.existingMortgage.firstPaymentDate,
		maturityDate: args.existingMortgage.maturityDate,
		mortgageId: args.existingMortgage._id,
		now: args.now,
		orgId: args.orgId,
		paymentAmount: args.existingMortgage.paymentAmount,
		paymentFrequency: args.existingMortgage.paymentFrequency,
		primaryBorrowerId,
		principal: args.existingMortgage.principal,
	});

	await ctx.db.patch(args.existingMortgage._id, {
		paymentBootstrapScheduleRuleMissing: paymentBootstrap.scheduleRuleMissing,
	});

	const existingObligationIdSet = new Set(
		existingObligations.map((obligation) => obligation._id)
	);
	const existingPlanEntryIdSet = new Set(
		existingPlanEntries.map((entry) => entry._id)
	);

	return {
		...paymentBootstrap,
		createdObligationIds: paymentBootstrap.createdObligationIds.filter(
			(obligationId) => !existingObligationIdSet.has(obligationId)
		),
		createdPlanEntryIds: paymentBootstrap.createdPlanEntryIds.filter(
			(planEntryId) => !existingPlanEntryIdSet.has(planEntryId)
		),
	};
}

async function ensureReplaySafeListingProjection(
	ctx: MutationCtx,
	args: Pick<ActivateMortgageAggregateInput, "listingOverrides" | "now"> & {
		existingMortgage: Doc<"mortgages">;
	}
) {
	const existingListing = await ctx.db
		.query("listings")
		.withIndex("by_mortgage", (query) =>
			query.eq("mortgageId", args.existingMortgage._id)
		)
		.unique();
	if (existingListing) {
		return existingListing._id;
	}

	const listingProjection = await upsertMortgageListingProjection(ctx, {
		mortgageId: args.existingMortgage._id,
		now: args.now,
		overrides: toListingProjectionOverrides(args.listingOverrides),
	});

	return listingProjection.listingId;
}

export interface ActivateMortgageAggregateInput {
	actorAuthId: string;
	actorType: "admin" | "member";
	assignedBrokerId?: Id<"brokers">;
	borrowerLinks: Array<{
		borrowerId: Id<"borrowers">;
		role: Doc<"mortgageBorrowers">["role"];
	}>;
	brokerOfRecordId: Id<"brokers">;
	collectionsDraft?: Doc<"adminOriginationCases">["collectionsDraft"];
	listingOverrides?: Doc<"adminOriginationCases">["listingOverrides"];
	mortgageDraft: NonNullable<Doc<"adminOriginationCases">["mortgageDraft"]>;
	now: number;
	orgId?: string;
	propertyDraft: NonNullable<Doc<"adminOriginationCases">["propertyDraft"]>;
	source: MortgageActivationSource;
	stagedCaseStatus: Doc<"adminOriginationCases">["status"];
	valuationDraft?: Doc<"adminOriginationCases">["valuationDraft"];
	viewerUserId: Id<"users">;
}

export interface ActivateMortgageAggregateResult {
	borrowerIds: Id<"borrowers">[];
	createdObligationIds: Id<"obligations">[];
	createdPlanEntryIds: Id<"collectionPlanEntries">[];
	dealBlueprintCount: number;
	listingId: Id<"listings"> | null;
	mortgageId: Id<"mortgages">;
	primaryBorrowerId: Id<"borrowers"> | null;
	propertyId: Id<"properties">;
	publicBlueprintCount: number;
	scheduleRuleMissing: boolean;
	valuationSnapshotId: Id<"mortgageValuationSnapshots"> | null;
	wasAlreadyCommitted: boolean;
}

export async function activateMortgageAggregate(
	ctx: MutationCtx,
	args: ActivateMortgageAggregateInput
): Promise<ActivateMortgageAggregateResult> {
	const existingMortgage = await ctx.db
		.query("mortgages")
		.withIndex("by_workflow_source_key", (query) =>
			query.eq("workflowSourceKey", args.source.workflowSourceKey)
		)
		.unique();
	if (existingMortgage) {
		const paymentBootstrap = await ensureReplaySafePaymentBootstrap(ctx, {
			existingMortgage,
			now: args.now,
			orgId: args.orgId,
		});
		await ensureReplaySafeListingProjection(ctx, {
			existingMortgage,
			listingOverrides: args.listingOverrides,
			now: args.now,
		});
		const refreshedMortgage =
			(await ctx.db.get(existingMortgage._id)) ?? existingMortgage;
		return readExistingActivationResult(
			ctx,
			refreshedMortgage,
			paymentBootstrap
		);
	}

	const { propertyId } = await resolveCanonicalProperty(ctx, {
		now: args.now,
		propertyDraft: args.propertyDraft,
	});
	const mortgageInputs = requireMortgageActivationInputs(args.mortgageDraft);
	const borrowerIds = dedupeBorrowerIds(args.borrowerLinks);
	const primaryBorrowerId = resolvePrimaryBorrowerId(args.borrowerLinks);
	if (!primaryBorrowerId) {
		throw new ConvexError(
			"Mortgage activation requires a primary borrower before payment bootstrap."
		);
	}

	const mortgageId = await ctx.db.insert("mortgages", {
		activeExternalCollectionScheduleId: undefined,
		amortizationMonths: mortgageInputs.amortizationMonths,
		annualServicingRate: args.mortgageDraft.annualServicingRate,
		assignedBrokerId: args.assignedBrokerId,
		brokerOfRecordId: args.brokerOfRecordId,
		collectionExecutionMode: "app_owned",
		collectionExecutionProviderCode: undefined,
		collectionExecutionUpdatedAt: args.now,
		createdAt: args.now,
		creationSource: args.source.creationSource,
		fundedAt: args.mortgageDraft.fundedAt,
		firstPaymentDate: mortgageInputs.firstPaymentDate,
		interestAdjustmentDate: mortgageInputs.interestAdjustmentDate,
		interestRate: mortgageInputs.interestRate,
		isRenewal: args.mortgageDraft.isRenewal,
		lastTransitionAt: args.now,
		lienPosition: mortgageInputs.lienPosition,
		loanType: mortgageInputs.loanType,
		machineContext: { missedPayments: 0, lastPaymentAt: 0 },
		maturityDate: mortgageInputs.maturityDate,
		orgId: args.orgId,
		originationPath: args.source.originationPath,
		originatedByUserId: args.source.originatedByUserId,
		originatingWorkflowId: args.source.originatingWorkflowId,
		originatingWorkflowType: args.source.originatingWorkflowType,
		paymentAmount: mortgageInputs.paymentAmount,
		paymentFrequency: mortgageInputs.paymentFrequency,
		principal: mortgageInputs.principal,
		priorMortgageId: args.mortgageDraft.priorMortgageId,
		propertyId,
		rateType: mortgageInputs.rateType,
		status: "active",
		termMonths: mortgageInputs.termMonths,
		termStartDate: mortgageInputs.termStartDate,
		workflowSourceId: args.source.workflowSourceId,
		workflowSourceKey: args.source.workflowSourceKey,
		workflowSourceType: args.source.workflowSourceType,
	});

	const valuationSnapshot = args.valuationDraft?.valueAsIs
		? await createOriginationValuationSnapshot(ctx, {
				createdAt: args.now,
				createdByUserId: args.viewerUserId,
				mortgageId,
				relatedDocumentAssetId: args.valuationDraft.relatedDocumentAssetId,
				source: "admin_origination",
				termStartDate: mortgageInputs.termStartDate,
				valuationDate: args.valuationDraft.valuationDate,
				valueAsIs: args.valuationDraft.valueAsIs,
			})
		: null;

	for (const borrowerLink of args.borrowerLinks) {
		await ensureMortgageBorrowerLink(ctx, {
			addedAt: args.now,
			borrowerId: borrowerLink.borrowerId,
			mortgageId,
			role: borrowerLink.role,
		});
	}

	const paymentBootstrap = await bootstrapOriginationPayments(ctx, {
		firstPaymentDate: mortgageInputs.firstPaymentDate,
		maturityDate: mortgageInputs.maturityDate,
		mortgageId,
		now: args.now,
		orgId: args.orgId,
		paymentAmount: mortgageInputs.paymentAmount,
		paymentFrequency: mortgageInputs.paymentFrequency,
		primaryBorrowerId,
		principal: mortgageInputs.principal,
	});

	await ctx.db.patch(mortgageId, {
		paymentBootstrapScheduleRuleMissing: paymentBootstrap.scheduleRuleMissing,
	});

	const blueprintCounts =
		args.source.workflowSourceType === ORIGINATION_WORKFLOW_SOURCE_TYPE
			? await materializeMortgageBlueprintsFromCaseDrafts(ctx, {
					caseId: args.source.workflowSourceId as Id<"adminOriginationCases">,
					mortgageId,
					now: args.now,
					viewerUserId: args.viewerUserId,
				})
			: {
					dealBlueprintCount: 0,
					publicBlueprintCount: 0,
				};
	const listingProjection = await upsertMortgageListingProjection(ctx, {
		mortgageId,
		now: args.now,
		overrides: toListingProjectionOverrides(args.listingOverrides),
	});

	// The constructor contract is locked now so later phases can extend
	// provider-managed collections and documents without reshaping activation.
	await mintMortgageHandler(ctx, {
		effectiveDate: mortgageInputs.termStartDate ?? toBusinessDate(args.now),
		idempotencyKey: `${args.source.workflowSourceKey}:ledger-genesis`,
		metadata: {
			caseId: args.source.originatingWorkflowId,
			orgId: args.orgId,
			stagedCollectionMode: args.collectionsDraft?.mode,
		},
		mortgageId: String(mortgageId),
		source: {
			type: "user",
			actor: args.actorAuthId,
			channel: "admin_origination",
		},
	});

	await appendAuditJournalEntry(ctx, {
		actorId: args.actorAuthId,
		actorType: args.actorType,
		channel: "admin_dashboard",
		entityId: String(mortgageId),
		entityType: "mortgage",
		eventCategory: "origination_commit",
		eventType: "ORIGINATION_COMMITTED",
		idempotencyKey: args.source.workflowSourceKey,
		linkedRecordIds: {
			appraisalId: valuationSnapshot?.appraisalId
				? String(valuationSnapshot.appraisalId)
				: undefined,
			borrowerIds: borrowerIds.map(String),
			caseId: args.source.originatingWorkflowId,
			entityId: String(mortgageId),
			listingId: String(listingProjection.listingId),
			obligationIds: paymentBootstrap.createdObligationIds.map(String),
			planEntryIds: paymentBootstrap.createdPlanEntryIds.map(String),
			propertyId: String(propertyId),
			valuationSnapshotId: valuationSnapshot?.valuationSnapshotId
				? String(valuationSnapshot.valuationSnapshotId)
				: undefined,
			viewerUserId: String(args.viewerUserId),
		},
		newState: "active",
		organizationId: args.orgId,
		outcome: "transitioned",
		payload: {
			appraisalId: valuationSnapshot?.appraisalId
				? String(valuationSnapshot.appraisalId)
				: null,
			collectionExecutionMode: "app_owned",
			creationSource: args.source.creationSource,
			createdObligationCount: paymentBootstrap.createdObligationIds.length,
			createdPlanEntryCount: paymentBootstrap.createdPlanEntryIds.length,
			listingId: String(listingProjection.listingId),
			mortgageId: String(mortgageId),
			originationPath: args.source.originationPath,
			originatedByUserId: args.source.originatedByUserId,
			originatingWorkflowId: args.source.originatingWorkflowId,
			originatingWorkflowType: args.source.originatingWorkflowType,
			propertyId: String(propertyId),
			scheduleRuleMissing: paymentBootstrap.scheduleRuleMissing,
			stagedCaseStatus: args.stagedCaseStatus,
			stagedCollectionMode: args.collectionsDraft?.mode,
			valuationSnapshotId: valuationSnapshot?.valuationSnapshotId
				? String(valuationSnapshot.valuationSnapshotId)
				: null,
		},
		previousState: "none",
		timestamp: args.now,
	});

	return {
		borrowerIds,
		createdObligationIds: paymentBootstrap.createdObligationIds,
		createdPlanEntryIds: paymentBootstrap.createdPlanEntryIds,
		dealBlueprintCount: blueprintCounts.dealBlueprintCount,
		listingId: listingProjection.listingId,
		mortgageId,
		primaryBorrowerId,
		propertyId,
		publicBlueprintCount: blueprintCounts.publicBlueprintCount,
		scheduleRuleMissing: paymentBootstrap.scheduleRuleMissing,
		valuationSnapshotId: valuationSnapshot?.valuationSnapshotId ?? null,
		wasAlreadyCommitted: false,
	};
}
