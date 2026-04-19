export const ORIGINATION_STEP_KEYS = [
	"participants",
	"property",
	"mortgageTerms",
	"collections",
	"documents",
	"listingCuration",
	"review",
] as const;

export type OriginationStepKey = (typeof ORIGINATION_STEP_KEYS)[number];

export const INITIAL_ORIGINATION_STEP: OriginationStepKey = "participants";

export interface OriginationStepDefinition {
	readonly description: string;
	readonly key: OriginationStepKey;
	readonly label: string;
}

export const ORIGINATION_STEPS: readonly OriginationStepDefinition[] = [
	{
		key: "participants",
		label: "Participants",
		description: "Borrower and broker draft data.",
	},
	{
		key: "property",
		label: "Property + valuation",
		description: "Property identity and valuation snapshot staging.",
	},
	{
		key: "mortgageTerms",
		label: "Mortgage terms",
		description: "Economics, dates, and cadence for the staged mortgage.",
	},
	{
		key: "collections",
		label: "Collections",
		description: "Choose app-owned servicing or immediate Rotessa activation.",
	},
	{
		key: "documents",
		label: "Documents",
		description: "Static uploads and pinned template/group blueprint staging.",
	},
	{
		key: "listingCuration",
		label: "Listing curation",
		description: "Marketplace copy and merchandising overrides.",
	},
	{
		key: "review",
		label: "Review + commit",
		description: "Persisted summary and canonical activation controls.",
	},
] as const;

export const ORIGINATION_COMMIT_BLOCKING_STEP_KEYS = [
	"participants",
	"property",
	"mortgageTerms",
] as const satisfies readonly OriginationStepKey[];

export interface OriginationParticipantDraft {
	draftId?: string;
	email?: string;
	existingBorrowerId?: string;
	fullName?: string;
	phone?: string;
}

export interface OriginationParticipantsDraft {
	assignedBrokerId?: string;
	assignedBrokerLabel?: string;
	brokerOfRecordId?: string;
	brokerOfRecordLabel?: string;
	coBorrowers?: OriginationParticipantDraft[];
	guarantors?: OriginationParticipantDraft[];
	primaryBorrower?: OriginationParticipantDraft;
}

export type OriginationPropertyType =
	| "commercial"
	| "condo"
	| "multi_unit"
	| "residential";

export interface OriginationGooglePlaceData {
	addressComponents?: Array<{
		longText?: string;
		shortText?: string;
		types?: string[];
	}>;
	formattedAddress?: string;
	location?: {
		latitude?: number;
		longitude?: number;
	};
	placeId: string;
	postalAddress?: {
		addressLines?: string[];
		administrativeArea?: string;
		languageCode?: string;
		locality?: string;
		postalCode?: string;
		regionCode?: string;
	};
	types?: string[];
}

export interface OriginationPropertyCreateDraft {
	approximateLatitude?: number;
	approximateLongitude?: number;
	city?: string;
	googlePlaceData?: OriginationGooglePlaceData;
	postalCode?: string;
	propertyType?: OriginationPropertyType;
	province?: string;
	streetAddress?: string;
	unit?: string;
}

export interface OriginationPropertyDraft {
	create?: OriginationPropertyCreateDraft;
	propertyId?: string;
}

export interface OriginationValuationDraft {
	relatedDocumentAssetId?: string;
	valuationDate?: string;
	valueAsIs?: number;
	visibilityHint?: "private" | "public";
}

export interface OriginationHeroImageDraft {
	caption?: string;
	storageId: string;
}

export type OriginationHeroImageDraftInput = OriginationHeroImageDraft | string;

export type OriginationRateType = "fixed" | "variable";

export type OriginationPaymentFrequency =
	| "accelerated_bi_weekly"
	| "bi_weekly"
	| "monthly"
	| "weekly";

export type OriginationLoanType = "conventional" | "high_ratio" | "insured";

export interface OriginationMortgageDraft {
	amortizationMonths?: number;
	annualServicingRate?: number;
	firstPaymentDate?: string;
	fundedAt?: number;
	interestAdjustmentDate?: string;
	interestRate?: number;
	isRenewal?: boolean;
	lienPosition?: number;
	loanType?: OriginationLoanType;
	maturityDate?: string;
	paymentAmount?: number;
	paymentFrequency?: OriginationPaymentFrequency;
	principal?: number;
	priorMortgageId?: string;
	rateType?: OriginationRateType;
	termMonths?: number;
	termStartDate?: string;
}

export interface OriginationCollectionsDraft {
	activationStatus?: "active" | "activating" | "failed" | "pending";
	borrowerSource?: "create" | "existing";
	executionIntent?: "app_owned" | "provider_managed_now";
	executionStrategy?: "manual";
	externalCollectionScheduleId?: string;
	lastAttemptAt?: number;
	lastError?: string;
	mode?: "app_owned_only" | "provider_managed_now";
	padAuthorizationAssetId?: string;
	padAuthorizationOverrideReason?: string;
	padAuthorizationSource?: "admin_override" | "uploaded";
	providerCode?: "pad_rotessa";
	providerManagedActivationStatus?:
		| "active"
		| "activating"
		| "failed"
		| "pending";
	retryCount?: number;
	scheduleSource?: "create" | "existing";
	selectedBankAccountId?: string;
	selectedBorrowerId?: string;
	selectedExistingExternalScheduleId?: string;
	selectedProviderScheduleId?: string;
}

export interface OriginationListingOverridesDraft {
	adminNotes?: string;
	description?: string;
	displayOrder?: number;
	featured?: boolean;
	heroImages?: OriginationHeroImageDraftInput[];
	marketplaceCopy?: string;
	seoSlug?: string;
	title?: string;
}

export interface OriginationValidationSnapshot {
	reviewWarnings?: string[];
	stepErrors?: Record<string, string[]>;
}

export interface OriginationCaseDraftValues {
	collectionsDraft?: OriginationCollectionsDraft;
	currentStep?: OriginationStepKey;
	listingOverrides?: OriginationListingOverridesDraft;
	mortgageDraft?: OriginationMortgageDraft;
	participantsDraft?: OriginationParticipantsDraft;
	propertyDraft?: OriginationPropertyDraft;
	validationSnapshot?: OriginationValidationSnapshot;
	valuationDraft?: OriginationValuationDraft;
}

export interface OriginationCaseDraftRecord extends OriginationCaseDraftValues {
	_id: string;
	committedAt?: number;
	committedListingId?: string;
	committedMortgageId?: string;
	committedValuationSnapshotId?: string;
	createdAt: number;
	failedAt?: number;
	lastCommitError?: string;
	status:
		| "awaiting_identity_sync"
		| "committed"
		| "committing"
		| "draft"
		| "failed"
		| "ready_to_commit";
	updatedAt: number;
}

export function getOriginationStepDefinition(step: OriginationStepKey) {
	return ORIGINATION_STEPS.find((definition) => definition.key === step);
}

function coalesceText(values: Array<string | undefined>) {
	return values.find(
		(value) => typeof value === "string" && value.trim().length > 0
	);
}

export function buildOriginationCaseLabel(input: {
	caseId: string;
	participantsDraft?: OriginationParticipantsDraft;
	propertyDraft?: OriginationPropertyDraft;
}) {
	const primaryBorrowerName = coalesceText([
		input.participantsDraft?.primaryBorrower?.fullName,
		input.participantsDraft?.primaryBorrower?.email,
	]);

	if (primaryBorrowerName) {
		return primaryBorrowerName;
	}

	const property = input.propertyDraft?.create;
	const propertyLabel = coalesceText([
		property?.streetAddress,
		property?.city,
		property?.postalCode,
	]);

	if (propertyLabel) {
		return propertyLabel;
	}

	return `Origination case ${buildOriginationCaseShortId(input.caseId)}`;
}

export function buildOriginationCaseShortId(caseId: string) {
	return caseId.slice(-6).toUpperCase();
}

let originationDraftIdCounter = 0;

export function createOriginationDraftId(prefix = "draft") {
	const randomId = globalThis.crypto?.randomUUID?.();
	if (randomId) {
		return `${prefix}-${randomId}`;
	}

	originationDraftIdCounter += 1;
	return `${prefix}-${Date.now().toString(36)}-${originationDraftIdCounter.toString(36)}`;
}

function ensureParticipantDraftId(
	participant: OriginationParticipantDraft | undefined,
	prefix: string
) {
	if (!participant) {
		return undefined;
	}

	if (participant.draftId) {
		return participant;
	}

	return {
		...participant,
		draftId: createOriginationDraftId(prefix),
	};
}

export function ensureOriginationParticipantDraftIds(
	draft: OriginationParticipantsDraft | undefined
) {
	if (!draft) {
		return undefined;
	}

	return {
		...draft,
		primaryBorrower: ensureParticipantDraftId(
			draft.primaryBorrower,
			"primary-borrower"
		),
		coBorrowers: draft.coBorrowers
			?.map((participant) =>
				ensureParticipantDraftId(participant, "co-borrower")
			)
			.filter(Boolean) as OriginationParticipantDraft[] | undefined,
		guarantors: draft.guarantors
			?.map((participant) => ensureParticipantDraftId(participant, "guarantor"))
			.filter(Boolean) as OriginationParticipantDraft[] | undefined,
	};
}
