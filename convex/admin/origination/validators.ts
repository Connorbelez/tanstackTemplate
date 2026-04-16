import { type Infer, v } from "convex/values";
import {
	INITIAL_ORIGINATION_STEP,
	ORIGINATION_COMMIT_BLOCKING_STEP_KEYS,
	ORIGINATION_STEP_KEYS,
	type OriginationStepKey,
	type OriginationValidationSnapshot,
} from "../../../src/lib/admin-origination";

export const originationCaseStatusValidator = v.union(
	v.literal("draft"),
	v.literal("ready_to_commit"),
	v.literal("awaiting_identity_sync"),
	v.literal("committing"),
	v.literal("failed"),
	v.literal("committed")
);

export const originationStepValidator = v.union(
	v.literal("participants"),
	v.literal("property"),
	v.literal("mortgageTerms"),
	v.literal("collections"),
	v.literal("documents"),
	v.literal("listingCuration"),
	v.literal("review")
);

export const originationParticipantDraftValidator = v.object({
	draftId: v.optional(v.string()),
	existingBorrowerId: v.optional(v.id("borrowers")),
	fullName: v.optional(v.string()),
	email: v.optional(v.string()),
	phone: v.optional(v.string()),
});

export const originationParticipantsDraftValidator = v.object({
	primaryBorrower: v.optional(originationParticipantDraftValidator),
	coBorrowers: v.optional(v.array(originationParticipantDraftValidator)),
	guarantors: v.optional(v.array(originationParticipantDraftValidator)),
	brokerOfRecordId: v.optional(v.id("brokers")),
	assignedBrokerId: v.optional(v.id("brokers")),
});

export const originationPropertyTypeValidator = v.union(
	v.literal("residential"),
	v.literal("commercial"),
	v.literal("multi_unit"),
	v.literal("condo")
);

export const originationPropertyCreateDraftValidator = v.object({
	streetAddress: v.optional(v.string()),
	unit: v.optional(v.string()),
	city: v.optional(v.string()),
	province: v.optional(v.string()),
	postalCode: v.optional(v.string()),
	propertyType: v.optional(originationPropertyTypeValidator),
	approximateLatitude: v.optional(v.number()),
	approximateLongitude: v.optional(v.number()),
});

export const originationPropertyDraftValidator = v.object({
	propertyId: v.optional(v.id("properties")),
	create: v.optional(originationPropertyCreateDraftValidator),
});

export const originationValuationDraftValidator = v.object({
	valueAsIs: v.optional(v.number()),
	valuationDate: v.optional(v.string()),
	relatedDocumentAssetId: v.optional(v.id("documentAssets")),
	visibilityHint: v.optional(
		v.union(v.literal("public"), v.literal("private"))
	),
});

export const originationRateTypeValidator = v.union(
	v.literal("fixed"),
	v.literal("variable")
);

export const originationPaymentFrequencyValidator = v.union(
	v.literal("monthly"),
	v.literal("bi_weekly"),
	v.literal("accelerated_bi_weekly"),
	v.literal("weekly")
);

export const originationLoanTypeValidator = v.union(
	v.literal("conventional"),
	v.literal("insured"),
	v.literal("high_ratio")
);

export const originationMortgageDraftValidator = v.object({
	principal: v.optional(v.number()),
	interestRate: v.optional(v.number()),
	rateType: v.optional(originationRateTypeValidator),
	termMonths: v.optional(v.number()),
	amortizationMonths: v.optional(v.number()),
	paymentAmount: v.optional(v.number()),
	paymentFrequency: v.optional(originationPaymentFrequencyValidator),
	loanType: v.optional(originationLoanTypeValidator),
	lienPosition: v.optional(v.number()),
	annualServicingRate: v.optional(v.number()),
	interestAdjustmentDate: v.optional(v.string()),
	termStartDate: v.optional(v.string()),
	maturityDate: v.optional(v.string()),
	firstPaymentDate: v.optional(v.string()),
	fundedAt: v.optional(v.number()),
	priorMortgageId: v.optional(v.id("mortgages")),
	isRenewal: v.optional(v.boolean()),
});

export const originationCollectionsDraftValidator = v.object({
	mode: v.optional(
		v.union(
			v.literal("none"),
			v.literal("app_owned_only"),
			v.literal("provider_managed_now")
		)
	),
	providerCode: v.optional(v.literal("pad_rotessa")),
	selectedBankAccountId: v.optional(v.id("bankAccounts")),
});

export const originationListingOverridesValidator = v.object({
	title: v.optional(v.string()),
	description: v.optional(v.string()),
	marketplaceCopy: v.optional(v.string()),
	heroImages: v.optional(v.array(v.string())),
	featured: v.optional(v.boolean()),
	displayOrder: v.optional(v.number()),
	seoSlug: v.optional(v.string()),
	adminNotes: v.optional(v.string()),
});

export const originationValidationSnapshotValidator = v.object({
	stepErrors: v.optional(v.record(v.string(), v.array(v.string()))),
	reviewWarnings: v.optional(v.array(v.string())),
});

export const adminOriginationCasePatchValidator = v.object({
	currentStep: v.optional(originationStepValidator),
	participantsDraft: v.optional(originationParticipantsDraftValidator),
	propertyDraft: v.optional(originationPropertyDraftValidator),
	valuationDraft: v.optional(originationValuationDraftValidator),
	mortgageDraft: v.optional(originationMortgageDraftValidator),
	collectionsDraft: v.optional(originationCollectionsDraftValidator),
	listingOverrides: v.optional(originationListingOverridesValidator),
});

export type AdminOriginationCasePatch = Infer<
	typeof adminOriginationCasePatchValidator
>;

export type OriginationParticipantDraftValue = Infer<
	typeof originationParticipantDraftValidator
>;
export type OriginationParticipantsDraftValue = Infer<
	typeof originationParticipantsDraftValidator
>;
export type OriginationPropertyCreateDraftValue = Infer<
	typeof originationPropertyCreateDraftValidator
>;
export type OriginationPropertyDraftValue = Infer<
	typeof originationPropertyDraftValidator
>;
export type OriginationValuationDraftValue = Infer<
	typeof originationValuationDraftValidator
>;
export type OriginationMortgageDraftValue = Infer<
	typeof originationMortgageDraftValidator
>;
export type OriginationCollectionsDraftValue = Infer<
	typeof originationCollectionsDraftValidator
>;
export type OriginationListingOverridesDraftValue = Infer<
	typeof originationListingOverridesValidator
>;

export interface OriginationCaseDraftState {
	collectionsDraft?: OriginationCollectionsDraftValue;
	currentStep?: OriginationStepKey;
	failedAt?: number;
	lastCommitError?: string;
	listingOverrides?: OriginationListingOverridesDraftValue;
	mortgageDraft?: OriginationMortgageDraftValue;
	participantsDraft?: OriginationParticipantsDraftValue;
	propertyDraft?: OriginationPropertyDraftValue;
	status?: Infer<typeof originationCaseStatusValidator>;
	validationSnapshot?: OriginationValidationSnapshot;
	valuationDraft?: OriginationValuationDraftValue;
}

export type OriginationCaseStatus = Infer<
	typeof originationCaseStatusValidator
>;

const PHASE_TWO_OWNED_STEP_KEYS = [
	"participants",
	"property",
	"mortgageTerms",
	"collections",
	"listingCuration",
] as const satisfies readonly OriginationStepKey[];

export const ORIGINATION_COMMIT_REVIEW_WARNING =
	"Resolve the required participant, property, and mortgage fields before committing this origination case.";
export const ORIGINATION_PROVIDER_MANAGED_COLLECTIONS_WARNING =
	"Provider-managed collections are deferred. Phase 2 activation always creates an app-owned mortgage.";

function trimToUndefined(value: string | undefined) {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function hasValue(value: unknown) {
	if (value === null || value === undefined) {
		return false;
	}

	if (Array.isArray(value)) {
		return value.length > 0;
	}

	if (typeof value === "object") {
		return Object.keys(value as Record<string, unknown>).length > 0;
	}

	return true;
}

function pruneObject<T extends Record<string, unknown>>(value: T) {
	const entries = Object.entries(value).filter(([, entryValue]) =>
		hasValue(entryValue)
	);

	if (entries.length === 0) {
		return undefined;
	}

	return Object.fromEntries(entries) as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function mergeDeep<T>(existing: T, patch: T): T {
	if (!(isPlainObject(existing) && isPlainObject(patch))) {
		return patch;
	}

	const merged: Record<string, unknown> = { ...existing };

	for (const [key, patchValue] of Object.entries(patch)) {
		const existingValue = merged[key];

		if (Array.isArray(patchValue)) {
			merged[key] = [...patchValue];
			continue;
		}

		if (isPlainObject(existingValue) && isPlainObject(patchValue)) {
			merged[key] = mergeDeep(existingValue, patchValue);
			continue;
		}

		merged[key] = patchValue;
	}

	return merged as T;
}

function pickUnknownFields(
	value: Record<string, unknown>,
	knownKeys: readonly string[]
) {
	return Object.fromEntries(
		Object.entries(value).filter(([key]) => !knownKeys.includes(key))
	);
}

export function mergeOriginationCaseDraftValues(
	existing: OriginationCaseDraftState,
	patch: OriginationCaseDraftState
): OriginationCaseDraftState {
	const merged = mergeDeep(existing, patch);

	return {
		...merged,
		participantsDraft: normalizeOriginationParticipantsDraft(
			merged.participantsDraft
		),
		propertyDraft: normalizeOriginationPropertyDraft(merged.propertyDraft),
		valuationDraft: normalizeOriginationValuationDraft(merged.valuationDraft),
		mortgageDraft: normalizeOriginationMortgageDraft(merged.mortgageDraft),
		collectionsDraft: normalizeOriginationCollectionsDraft(
			merged.collectionsDraft
		),
		listingOverrides: normalizeOriginationListingOverridesDraft(
			merged.listingOverrides
		),
	};
}

export function computeOriginationValidationSnapshot(
	values: OriginationCaseDraftState,
	existingSnapshot:
		| OriginationValidationSnapshot
		| undefined = values.validationSnapshot
): OriginationValidationSnapshot {
	const normalized = mergeOriginationCaseDraftValues({}, values);
	const phaseOneStepErrors: Record<string, string[]> = {};
	assignStepErrors(
		phaseOneStepErrors,
		"participants",
		buildParticipantsValidationErrors(normalized)
	);
	assignStepErrors(
		phaseOneStepErrors,
		"property",
		buildPropertyValidationErrors(normalized)
	);
	assignStepErrors(
		phaseOneStepErrors,
		"mortgageTerms",
		buildMortgageValidationErrors(normalized)
	);
	assignStepErrors(
		phaseOneStepErrors,
		"collections",
		buildCollectionsValidationErrors(normalized)
	);
	assignStepErrors(
		phaseOneStepErrors,
		"listingCuration",
		buildListingValidationErrors(normalized)
	);

	const mergedStepErrors: Record<string, string[]> = Object.fromEntries(
		Object.entries(existingSnapshot?.stepErrors ?? {}).filter(
			([key]) =>
				!PHASE_TWO_OWNED_STEP_KEYS.some((ownedStep) => ownedStep === key)
		)
	);
	for (const [key, errors] of Object.entries(phaseOneStepErrors)) {
		if (errors.length > 0) {
			mergedStepErrors[key] = errors;
		} else {
			delete mergedStepErrors[key];
		}
	}

	const reviewWarnings = [
		...(existingSnapshot?.reviewWarnings ?? []).filter(
			(warning) =>
				warning !== ORIGINATION_COMMIT_REVIEW_WARNING &&
				warning !== ORIGINATION_PROVIDER_MANAGED_COLLECTIONS_WARNING
		),
	];
	const hasCommitBlockingErrors = ORIGINATION_COMMIT_BLOCKING_STEP_KEYS.some(
		(step) => (mergedStepErrors[step] ?? []).length > 0
	);
	if (hasCommitBlockingErrors) {
		reviewWarnings.push(ORIGINATION_COMMIT_REVIEW_WARNING);
	}
	if (normalized.collectionsDraft?.mode === "provider_managed_now") {
		reviewWarnings.push(ORIGINATION_PROVIDER_MANAGED_COLLECTIONS_WARNING);
	}

	return {
		reviewWarnings,
		stepErrors: mergedStepErrors,
	};
}

export function hasOriginationCommitBlockingErrors(
	snapshot: OriginationValidationSnapshot | undefined
) {
	return ORIGINATION_COMMIT_BLOCKING_STEP_KEYS.some(
		(step) => (snapshot?.stepErrors?.[step] ?? []).length > 0
	);
}

export function resolveDraftOriginationCaseStatus(args: {
	currentStatus?: OriginationCaseStatus;
	validationSnapshot?: OriginationValidationSnapshot;
}): OriginationCaseStatus {
	if (
		args.currentStatus === "awaiting_identity_sync" ||
		args.currentStatus === "committed"
	) {
		return args.currentStatus;
	}

	return hasOriginationCommitBlockingErrors(args.validationSnapshot)
		? "draft"
		: "ready_to_commit";
}

function assignStepErrors(
	stepErrors: Record<string, string[]>,
	step: OriginationStepKey,
	errors: string[]
) {
	if (errors.length > 0) {
		stepErrors[step] = errors;
	}
}

function collectMissingFieldErrors(
	fields: ReadonlyArray<{
		message: string;
		value: unknown;
	}>
) {
	const errors: string[] = [];

	for (const field of fields) {
		if (!field.value) {
			errors.push(field.message);
		}
	}

	return errors;
}

function buildParticipantsValidationErrors(values: OriginationCaseDraftState) {
	const primaryBorrower = values.participantsDraft?.primaryBorrower;
	const primaryBorrowerUsesExisting = Boolean(
		primaryBorrower?.existingBorrowerId
	);

	return collectMissingFieldErrors([
		{
			value: primaryBorrowerUsesExisting ? true : primaryBorrower?.fullName,
			message: "Primary borrower full name is required.",
		},
		{
			value: primaryBorrowerUsesExisting ? true : primaryBorrower?.email,
			message: "Primary borrower email is required.",
		},
		{
			value: values.participantsDraft?.brokerOfRecordId,
			message: "Broker of record is required.",
		},
	]);
}

function buildPropertyValidationErrors(values: OriginationCaseDraftState) {
	const propertyCreate = values.propertyDraft?.create;
	const propertyReference = values.propertyDraft?.propertyId;

	return collectMissingFieldErrors([
		{
			value: propertyReference || propertyCreate?.streetAddress,
			message: "Property street address is required.",
		},
		{
			value: propertyReference || propertyCreate?.city,
			message: "Property city is required.",
		},
		{
			value: propertyReference || propertyCreate?.province,
			message: "Property province is required.",
		},
		{
			value: propertyReference || propertyCreate?.postalCode,
			message: "Property postal code is required.",
		},
		{
			value: propertyReference || propertyCreate?.propertyType,
			message: "Property type is required.",
		},
		{
			value: values.valuationDraft?.valueAsIs,
			message: "Valuation amount is required.",
		},
	]);
}

function buildMortgageValidationErrors(values: OriginationCaseDraftState) {
	const mortgage = values.mortgageDraft;

	return collectMissingFieldErrors([
		{
			value: mortgage?.principal,
			message: "Principal is required.",
		},
		{
			value: mortgage?.interestRate,
			message: "Interest rate is required.",
		},
		{
			value: mortgage?.rateType,
			message: "Rate type is required.",
		},
		{
			value: mortgage?.termMonths,
			message: "Term length is required.",
		},
		{
			value: mortgage?.amortizationMonths,
			message: "Amortization is required.",
		},
		{
			value: mortgage?.paymentAmount,
			message: "Payment amount is required.",
		},
		{
			value: mortgage?.paymentFrequency,
			message: "Payment frequency is required.",
		},
		{
			value: mortgage?.loanType,
			message: "Loan type is required.",
		},
		{
			value: mortgage?.lienPosition,
			message: "Lien position is required.",
		},
		{
			value: mortgage?.interestAdjustmentDate,
			message: "Interest adjustment date is required.",
		},
		{
			value: mortgage?.termStartDate,
			message: "Term start date is required.",
		},
		{
			value: mortgage?.firstPaymentDate,
			message: "First payment date is required.",
		},
		{
			value: mortgage?.maturityDate,
			message: "Maturity date is required.",
		},
	]);
}

function buildCollectionsValidationErrors(_values: OriginationCaseDraftState) {
	return [];
}

function buildListingValidationErrors(_values: OriginationCaseDraftState) {
	return [];
}

export function determineRecommendedOriginationStep(
	values: OriginationCaseDraftState
): OriginationStepKey {
	const snapshot = computeOriginationValidationSnapshot(
		values,
		values.validationSnapshot
	);

	for (const step of ORIGINATION_STEP_KEYS) {
		if ((snapshot.stepErrors?.[step] ?? []).length > 0) {
			return step;
		}
	}

	return values.currentStep ?? INITIAL_ORIGINATION_STEP;
}

export function listOriginationStepErrors(
	snapshot: OriginationValidationSnapshot | undefined,
	step: OriginationStepKey
) {
	return snapshot?.stepErrors?.[step] ?? [];
}

export function isOriginationStepComplete(
	snapshot: OriginationValidationSnapshot | undefined,
	step: OriginationStepKey
) {
	return listOriginationStepErrors(snapshot, step).length === 0;
}

export function isOriginationStepKey(
	value: string
): value is OriginationStepKey {
	return ORIGINATION_STEP_KEYS.includes(value as OriginationStepKey);
}

export function normalizeOriginationParticipantDraft(
	value: OriginationParticipantDraftValue | undefined
) {
	if (!value) {
		return undefined;
	}

	return pruneObject({
		...pickUnknownFields(value as Record<string, unknown>, [
			"draftId",
			"existingBorrowerId",
			"fullName",
			"email",
			"phone",
		]),
		draftId: trimToUndefined(value.draftId),
		existingBorrowerId: value.existingBorrowerId,
		fullName: trimToUndefined(value.fullName),
		email: trimToUndefined(value.email),
		phone: trimToUndefined(value.phone),
	});
}

export function normalizeOriginationParticipantsDraft(
	value: OriginationParticipantsDraftValue | undefined
) {
	if (!value) {
		return undefined;
	}

	const coBorrowers = value.coBorrowers
		?.map(normalizeOriginationParticipantDraft)
		.filter(Boolean) as OriginationParticipantsDraftValue["coBorrowers"];
	const guarantors = value.guarantors
		?.map(normalizeOriginationParticipantDraft)
		.filter(Boolean) as OriginationParticipantsDraftValue["guarantors"];

	return pruneObject({
		...pickUnknownFields(value as Record<string, unknown>, [
			"primaryBorrower",
			"coBorrowers",
			"guarantors",
			"brokerOfRecordId",
			"assignedBrokerId",
		]),
		primaryBorrower: normalizeOriginationParticipantDraft(
			value.primaryBorrower
		),
		coBorrowers,
		guarantors,
		brokerOfRecordId: value.brokerOfRecordId,
		assignedBrokerId: value.assignedBrokerId,
	});
}

export function normalizeOriginationPropertyCreateDraft(
	value: OriginationPropertyCreateDraftValue | undefined
) {
	if (!value) {
		return undefined;
	}

	return pruneObject({
		...pickUnknownFields(value as Record<string, unknown>, [
			"streetAddress",
			"unit",
			"city",
			"province",
			"postalCode",
			"propertyType",
			"approximateLatitude",
			"approximateLongitude",
		]),
		streetAddress: trimToUndefined(value.streetAddress),
		unit: trimToUndefined(value.unit),
		city: trimToUndefined(value.city),
		province: trimToUndefined(value.province),
		postalCode: trimToUndefined(value.postalCode),
		propertyType: value.propertyType,
		approximateLatitude: value.approximateLatitude,
		approximateLongitude: value.approximateLongitude,
	});
}

export function normalizeOriginationPropertyDraft(
	value: OriginationPropertyDraftValue | undefined
) {
	if (!value) {
		return undefined;
	}

	return pruneObject({
		...pickUnknownFields(value as Record<string, unknown>, [
			"propertyId",
			"create",
		]),
		propertyId: value.propertyId,
		create: normalizeOriginationPropertyCreateDraft(value.create),
	});
}

export function normalizeOriginationValuationDraft(
	value: OriginationValuationDraftValue | undefined
) {
	if (!value) {
		return undefined;
	}

	return pruneObject({
		...pickUnknownFields(value as Record<string, unknown>, [
			"valueAsIs",
			"valuationDate",
			"relatedDocumentAssetId",
			"visibilityHint",
		]),
		valueAsIs: value.valueAsIs,
		valuationDate: trimToUndefined(value.valuationDate),
		relatedDocumentAssetId: value.relatedDocumentAssetId,
		visibilityHint: value.visibilityHint,
	});
}

export function normalizeOriginationMortgageDraft(
	value: OriginationMortgageDraftValue | undefined
) {
	if (!value) {
		return undefined;
	}

	return pruneObject({
		...pickUnknownFields(value as Record<string, unknown>, [
			"principal",
			"interestRate",
			"rateType",
			"termMonths",
			"amortizationMonths",
			"paymentAmount",
			"paymentFrequency",
			"loanType",
			"lienPosition",
			"annualServicingRate",
			"interestAdjustmentDate",
			"termStartDate",
			"maturityDate",
			"firstPaymentDate",
			"fundedAt",
			"priorMortgageId",
			"isRenewal",
		]),
		principal: value.principal,
		interestRate: value.interestRate,
		rateType: value.rateType,
		termMonths: value.termMonths,
		amortizationMonths: value.amortizationMonths,
		paymentAmount: value.paymentAmount,
		paymentFrequency: value.paymentFrequency,
		loanType: value.loanType,
		lienPosition: value.lienPosition,
		annualServicingRate: value.annualServicingRate,
		interestAdjustmentDate: trimToUndefined(value.interestAdjustmentDate),
		termStartDate: trimToUndefined(value.termStartDate),
		maturityDate: trimToUndefined(value.maturityDate),
		firstPaymentDate: trimToUndefined(value.firstPaymentDate),
		fundedAt: value.fundedAt,
		priorMortgageId: value.priorMortgageId,
		isRenewal: value.isRenewal,
	});
}

export function normalizeOriginationCollectionsDraft(
	value: OriginationCollectionsDraftValue | undefined
) {
	if (!value) {
		return undefined;
	}

	return pruneObject({
		...pickUnknownFields(value as Record<string, unknown>, [
			"mode",
			"providerCode",
			"selectedBankAccountId",
		]),
		mode: value.mode,
		providerCode: value.providerCode,
		selectedBankAccountId: value.selectedBankAccountId,
	});
}

export function normalizeOriginationListingOverridesDraft(
	value: OriginationListingOverridesDraftValue | undefined
) {
	if (!value) {
		return undefined;
	}

	const heroImages = value.heroImages
		?.map((image) => trimToUndefined(image))
		.filter((image): image is string => Boolean(image));

	return pruneObject({
		...pickUnknownFields(value as Record<string, unknown>, [
			"title",
			"description",
			"marketplaceCopy",
			"heroImages",
			"featured",
			"displayOrder",
			"seoSlug",
			"adminNotes",
		]),
		title: trimToUndefined(value.title),
		description: trimToUndefined(value.description),
		marketplaceCopy: trimToUndefined(value.marketplaceCopy),
		heroImages,
		featured: value.featured,
		displayOrder: value.displayOrder,
		seoSlug: trimToUndefined(value.seoSlug),
		adminNotes: trimToUndefined(value.adminNotes),
	});
}
