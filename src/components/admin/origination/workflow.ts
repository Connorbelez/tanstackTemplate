import {
	buildOriginationCaseLabel,
	buildOriginationCaseShortId,
	ensureOriginationParticipantDraftIds,
	INITIAL_ORIGINATION_STEP,
	ORIGINATION_STEPS,
	type OriginationCaseDraftRecord,
	type OriginationCaseDraftValues,
	type OriginationStepKey,
	type OriginationValidationSnapshot,
} from "#/lib/admin-origination";

export type OriginationWorkspaceSaveState =
	| "error"
	| "idle"
	| "pending"
	| "saved"
	| "saving";

export type OriginationStepperStatus =
	| "complete"
	| "error"
	| "in_progress"
	| "locked"
	| "not_started"
	| "warning";

export type OriginationCasePatch = Omit<
	OriginationCaseDraftValues,
	"validationSnapshot"
>;

export interface OriginationWorkspaceRecord extends OriginationCaseDraftRecord {
	label?: string;
	recommendedStep?: OriginationStepKey;
}

export interface OriginationCaseSummaryRow {
	caseId: string;
	caseShortId: string;
	createdAt: number;
	currentStep: OriginationStepKey;
	hasValidationErrors: boolean;
	label: string;
	primaryBorrowerName?: string;
	principal?: number;
	propertyAddress?: string;
	status: OriginationCaseDraftRecord["status"];
	updatedAt: number;
}

export interface OriginationStepperItem {
	description: string;
	errorCount: number;
	key: OriginationStepKey;
	label: string;
	status: OriginationStepperStatus;
}

export const ORIGINATION_DOCUMENT_SECTION_SHELLS = [
	{
		key: "public-static",
		title: "Public static docs",
		description:
			"Public-facing reference documents will be attached in the document blueprint phase.",
	},
	{
		key: "private-static",
		title: "Private static docs",
		description:
			"Internal-only attachments arrive later; phase 1 only reserves the workflow surface.",
	},
	{
		key: "private-templated",
		title: "Private templated non-signable docs",
		description:
			"Template-driven internal packets will be wired once blueprint ownership lands.",
	},
	{
		key: "private-signable",
		title: "Private templated signable docs",
		description:
			"Signature-ready document packages are intentionally deferred beyond the phase-1 shell.",
	},
] as const;

export function createOriginationDraftPatch(
	values: OriginationCaseDraftValues
): OriginationCasePatch {
	return {
		currentStep: values.currentStep,
		participantsDraft: values.participantsDraft,
		propertyDraft: values.propertyDraft,
		valuationDraft: values.valuationDraft,
		mortgageDraft: values.mortgageDraft,
		collectionsDraft: values.collectionsDraft,
		listingOverrides: values.listingOverrides,
	};
}

export function extractOriginationDraft(
	values: OriginationCaseDraftValues | null | undefined
): OriginationCasePatch {
	if (!values) {
		return {
			currentStep: INITIAL_ORIGINATION_STEP,
		};
	}

	return {
		currentStep: values.currentStep ?? INITIAL_ORIGINATION_STEP,
		participantsDraft: ensureOriginationParticipantDraftIds(
			values.participantsDraft
		),
		propertyDraft: values.propertyDraft,
		valuationDraft: values.valuationDraft,
		mortgageDraft: values.mortgageDraft,
		collectionsDraft: values.collectionsDraft,
		listingOverrides: values.listingOverrides,
	};
}

export function resolveOriginationReviewValues(
	persistedValues: OriginationCaseDraftValues | null | undefined,
	optimisticValues: OriginationCaseDraftValues
) {
	return persistedValues ?? optimisticValues;
}

function hasValue(value: unknown): boolean {
	if (value === null || value === undefined) {
		return false;
	}

	if (Array.isArray(value)) {
		return value.some((entry) => hasValue(entry));
	}

	if (typeof value === "object") {
		return Object.values(value as Record<string, unknown>).some((entry) =>
			hasValue(entry)
		);
	}

	if (typeof value === "string") {
		return value.trim().length > 0;
	}

	return true;
}

export function getOriginationStepErrors(
	snapshot: OriginationValidationSnapshot | undefined,
	step: OriginationStepKey
) {
	return snapshot?.stepErrors?.[step] ?? [];
}

export function getOriginationStepStatus(args: {
	currentStep?: OriginationStepKey;
	snapshot?: OriginationValidationSnapshot;
	step: OriginationStepKey;
	values: OriginationCaseDraftValues;
}): OriginationStepperStatus {
	const currentStep = args.currentStep ?? INITIAL_ORIGINATION_STEP;
	const currentIndex = ORIGINATION_STEPS.findIndex(
		(definition) => definition.key === currentStep
	);
	const stepIndex = ORIGINATION_STEPS.findIndex(
		(definition) => definition.key === args.step
	);
	const errorCount = getOriginationStepErrors(args.snapshot, args.step).length;
	const hasStepData = hasOriginationStepData(args.step, args.values);

	if (args.step === currentStep) {
		return errorCount > 0 ? "error" : "in_progress";
	}

	if (errorCount > 0) {
		return "warning";
	}

	if (stepIndex >= 0 && currentIndex > stepIndex) {
		return "complete";
	}

	if (hasStepData) {
		return "complete";
	}

	return "not_started";
}

export function buildOriginationStepperItems(args: {
	currentStep?: OriginationStepKey;
	snapshot?: OriginationValidationSnapshot;
	values: OriginationCaseDraftValues;
}): OriginationStepperItem[] {
	return ORIGINATION_STEPS.map((step) => ({
		...step,
		errorCount: getOriginationStepErrors(args.snapshot, step.key).length,
		status: getOriginationStepStatus({
			currentStep: args.currentStep,
			snapshot: args.snapshot,
			step: step.key,
			values: args.values,
		}),
	}));
}

export function buildOriginationWorkspaceTitle(input: {
	caseId: string;
	label?: string;
	values: OriginationCaseDraftValues;
}) {
	if (input.label && input.label.trim().length > 0) {
		return input.label;
	}

	return buildOriginationCaseLabel({
		caseId: input.caseId,
		participantsDraft: input.values.participantsDraft,
		propertyDraft: input.values.propertyDraft,
	});
}

export function buildOriginationWorkspaceSubtitle(caseId: string) {
	return `Origination case ${buildOriginationCaseShortId(caseId)}`;
}

export function formatOriginationCurrency(value: number | undefined) {
	if (typeof value !== "number") {
		return "Not staged";
	}

	return new Intl.NumberFormat("en-CA", {
		style: "currency",
		currency: "CAD",
		maximumFractionDigits: 0,
	}).format(value);
}

export function formatOriginationDateTime(value: number | undefined) {
	if (typeof value !== "number") {
		return "Just now";
	}

	return new Intl.DateTimeFormat("en-CA", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(value);
}

export function formatOriginationStepLabel(step: OriginationStepKey) {
	return (
		ORIGINATION_STEPS.find((definition) => definition.key === step)?.label ??
		step
	);
}

export function hasOriginationStepData(
	step: OriginationStepKey,
	values: OriginationCaseDraftValues
) {
	switch (step) {
		case "participants":
			return hasValue(values.participantsDraft);
		case "property":
			return hasValue(values.propertyDraft) || hasValue(values.valuationDraft);
		case "mortgageTerms":
			return hasValue(values.mortgageDraft);
		case "collections":
			return hasValue(values.collectionsDraft);
		case "documents":
			return false;
		case "listingCuration":
			return hasValue(values.listingOverrides);
		case "review":
			return (
				hasValue(values.participantsDraft) ||
				hasValue(values.propertyDraft) ||
				hasValue(values.valuationDraft) ||
				hasValue(values.mortgageDraft) ||
				hasValue(values.collectionsDraft) ||
				hasValue(values.listingOverrides)
			);
		default:
			return false;
	}
}
