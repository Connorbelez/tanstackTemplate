import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { appendAuditJournalEntry } from "../engine/auditJournal";
import { mintMortgageHandler } from "../ledger/mutations";
import {
	ensureMortgageBorrowerLink,
	findPropertyByAddress,
} from "../seed/seedHelpers";
import type { MortgageActivationSource } from "./provenance";
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

async function readExistingActivationResult(
	ctx: Pick<MutationCtx, "db">,
	existingMortgage: Doc<"mortgages">
): Promise<ActivateMortgageAggregateResult> {
	const [borrowerLinks, listing, valuationSnapshot] = await Promise.all([
		ctx.db
			.query("mortgageBorrowers")
			.withIndex("by_mortgage", (query) =>
				query.eq("mortgageId", existingMortgage._id)
			)
			.collect(),
		ctx.db
			.query("listings")
			.withIndex("by_mortgage", (query) =>
				query.eq("mortgageId", existingMortgage._id)
			)
			.unique(),
		ctx.db
			.query("mortgageValuationSnapshots")
			.withIndex("by_mortgage_created_at", (query) =>
				query.eq("mortgageId", existingMortgage._id)
			)
			.order("desc")
			.first(),
	]);

	const borrowerIds = dedupeBorrowerIds(borrowerLinks);
	const primaryBorrowerLink =
		borrowerLinks.find((link) => link.role === "primary") ?? borrowerLinks[0];

	return {
		borrowerIds,
		createdObligationIds: [],
		createdPlanEntryIds: [],
		dealBlueprintCount: 0,
		listingId: listing?._id ?? null,
		mortgageId: existingMortgage._id,
		primaryBorrowerId: primaryBorrowerLink?.borrowerId ?? null,
		propertyId: existingMortgage.propertyId,
		publicBlueprintCount: 0,
		scheduleRuleMissing: false,
		valuationSnapshotId: valuationSnapshot?._id ?? null,
		wasAlreadyCommitted: true,
	};
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
		return readExistingActivationResult(ctx, existingMortgage);
	}

	const { propertyId } = await resolveCanonicalProperty(ctx, {
		now: args.now,
		propertyDraft: args.propertyDraft,
	});
	const mortgageInputs = requireMortgageActivationInputs(args.mortgageDraft);
	const borrowerIds = dedupeBorrowerIds(args.borrowerLinks);
	const primaryBorrowerId = resolvePrimaryBorrowerId(args.borrowerLinks);

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

	// Phase 2 stops after aggregate activation, but the constructor contract is
	// locked now so later phases can append payment/listing work without reshaping it.
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
			mortgageId: String(mortgageId),
			originationPath: args.source.originationPath,
			originatedByUserId: args.source.originatedByUserId,
			originatingWorkflowId: args.source.originatingWorkflowId,
			originatingWorkflowType: args.source.originatingWorkflowType,
			propertyId: String(propertyId),
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
		createdObligationIds: [],
		createdPlanEntryIds: [],
		dealBlueprintCount: 0,
		listingId: null,
		mortgageId,
		primaryBorrowerId,
		propertyId,
		publicBlueprintCount: 0,
		scheduleRuleMissing: false,
		valuationSnapshotId: valuationSnapshot?.valuationSnapshotId ?? null,
		wasAlreadyCommitted: false,
	};
}
