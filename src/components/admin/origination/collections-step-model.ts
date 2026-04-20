import type {
	OriginationCollectionsDraft,
	OriginationMortgageDraft,
	OriginationParticipantsDraft,
	OriginationPaymentFrequency,
} from "#/lib/admin-origination";

export interface CollectionsStepBorrowerIdentity {
	borrowerId: string;
	email: string | null;
	fullName: string | null;
}

export interface CollectionsStepScheduleHydration {
	firstPaymentDate: string | null;
	originationPaymentFrequency: OriginationPaymentFrequency | null;
	paymentAmountCents: number | null;
}

export const COLLECTION_OPTIONS = [
	{
		value: "app_owned",
		label: "App managed via manual",
		description:
			"Manual collection handling for cash, cheque, wires, and other non-API servicing paths that FairLend confirms internally.",
	},
	{
		value: "provider_managed_now",
		label: "Provider managed via Rotessa payment schedule",
		description:
			"Select or create a Rotessa schedule against a canonical borrower, require PAD authorization, then activate it after canonical mortgage commit.",
	},
] as const;

export function buildBankAccountLabel(input: {
	accountLast4: string | null;
	institutionNumber: string | null;
	transitNumber: string | null;
}) {
	const parts = [
		input.accountLast4 ? `•••• ${input.accountLast4}` : null,
		input.institutionNumber && input.transitNumber
			? `${input.institutionNumber}-${input.transitNumber}`
			: null,
	].filter(Boolean);

	return parts.join(" • ") || "Bank account";
}

export function formatStatusLabel(value: string) {
	return value
		.split("_")
		.map((segment) =>
			segment.length > 0
				? `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`
				: segment
		)
		.join(" ");
}

export function formatCurrency(value: number | null | undefined) {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return "Not staged";
	}

	return new Intl.NumberFormat("en-CA", {
		currency: "CAD",
		style: "currency",
	}).format(value / 100);
}

export function resolveExecutionIntent(
	draft: OriginationCollectionsDraft | undefined
) {
	if (draft?.executionIntent) {
		return draft.executionIntent;
	}

	switch (draft?.mode) {
		case "app_owned_only":
			return "app_owned" as const;
		case "provider_managed_now":
			return "provider_managed_now" as const;
		default:
			return undefined;
	}
}

export function buildIntentDraft(
	draft: OriginationCollectionsDraft,
	intent: "app_owned" | "provider_managed_now"
): OriginationCollectionsDraft {
	if (intent === "app_owned") {
		return {
			executionIntent: "app_owned",
			executionStrategy: "manual",
			mode: "app_owned_only",
		};
	}

	const activationStatus =
		draft.providerManagedActivationStatus ??
		draft.activationStatus ??
		"pending";

	return {
		...draft,
		activationStatus,
		executionIntent: "provider_managed_now",
		mode: "provider_managed_now",
		providerCode: "pad_rotessa",
		providerManagedActivationStatus: activationStatus,
	};
}

export function buildProviderManagedDraft(
	draft: OriginationCollectionsDraft,
	patch: Partial<OriginationCollectionsDraft>
): OriginationCollectionsDraft {
	const base = buildIntentDraft(draft, "provider_managed_now");
	const activationStatus =
		patch.providerManagedActivationStatus ??
		patch.activationStatus ??
		base.providerManagedActivationStatus ??
		base.activationStatus ??
		"pending";

	return {
		...base,
		...patch,
		activationStatus,
		executionIntent: "provider_managed_now",
		mode: "provider_managed_now",
		providerCode: "pad_rotessa",
		providerManagedActivationStatus: activationStatus,
	};
}

export function buildBorrowerDisplayLabel(
	borrower: Pick<CollectionsStepBorrowerIdentity, "email" | "fullName">
) {
	return borrower.fullName ?? borrower.email ?? "Borrower";
}

export function buildParticipantsHydration(
	current: OriginationParticipantsDraft | undefined,
	borrower: CollectionsStepBorrowerIdentity
): OriginationParticipantsDraft {
	return {
		...(current ?? {}),
		primaryBorrower: {
			...(current?.primaryBorrower ?? {}),
			email: borrower.email ?? current?.primaryBorrower?.email,
			existingBorrowerId: borrower.borrowerId,
			fullName: borrower.fullName ?? current?.primaryBorrower?.fullName,
		},
	};
}

export function buildMortgageHydration(
	current: OriginationMortgageDraft | undefined,
	schedule: CollectionsStepScheduleHydration
): OriginationMortgageDraft {
	return {
		...(current ?? {}),
		firstPaymentDate: schedule.firstPaymentDate ?? current?.firstPaymentDate,
		paymentAmount: schedule.paymentAmountCents ?? current?.paymentAmount,
		paymentFrequency:
			schedule.originationPaymentFrequency ?? current?.paymentFrequency,
	};
}
