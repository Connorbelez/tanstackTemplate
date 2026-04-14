import { create } from "zustand";
import {
	brokerLandingContent,
	brokerListings,
	brokerTheme,
	emptyMortgageApplicationDraft,
	emptyOnboardingDraft,
} from "./mock-data";
import type {
	BrokerAuthIntent,
	BrokerOnboardingDraft,
	BrokerOnboardingFieldSet,
	BrokerWhiteLabelState,
	MortgageApplicationDraft,
	MortgageApplicationFieldSet,
} from "./types";

interface BrokerWhiteLabelActions {
	hydrateForTesting: (
		nextState: Partial<BrokerWhiteLabelState> & {
			onboarding?: Partial<BrokerOnboardingDraft>;
			mortgageApplication?: Partial<MortgageApplicationDraft>;
		}
	) => void;
	nextMortgageApplicationStep: () => void;
	nextOnboardingStep: () => void;
	previousMortgageApplicationStep: () => void;
	previousOnboardingStep: () => void;
	resetFlow: () => void;
	resetMortgageApplication: () => void;
	setIntent: (
		intent: Exclude<BrokerAuthIntent, "none">,
		options?: { sourceListingId?: string }
	) => void;
	setSourceListingId: (listingId?: string) => void;
	submitMortgageApplication: () => void;
	submitOnboarding: () => void;
	updateMortgageApplicationField: <K extends keyof MortgageApplicationFieldSet>(
		field: K,
		value: MortgageApplicationFieldSet[K]
	) => void;
	updateOnboardingField: <K extends keyof BrokerOnboardingFieldSet>(
		field: K,
		value: BrokerOnboardingFieldSet[K]
	) => void;
}

const mortgageApplicationLastStepIndex = 4;

const maxStepIndexByIntent: Record<BrokerAuthIntent, number> = {
	none: 0,
	lender: 2,
	borrower: 3,
	"mortgage-applicant": 3,
};

function createDraft(intent: BrokerAuthIntent): BrokerOnboardingDraft {
	return {
		...emptyOnboardingDraft,
		intent,
		currentStep: 0,
		isSubmitted: false,
		fields: { ...emptyOnboardingDraft.fields },
	};
}

function createMortgageApplicationDraft(): MortgageApplicationDraft {
	return {
		...emptyMortgageApplicationDraft,
		currentStep: 0,
		isSubmitted: false,
		fields: { ...emptyMortgageApplicationDraft.fields },
	};
}

export const useBrokerWhiteLabelStore = create<
	BrokerWhiteLabelState & BrokerWhiteLabelActions
>((set) => ({
	theme: brokerTheme,
	content: brokerLandingContent,
	listings: brokerListings,
	currentIntent: "none",
	sourceListingId: undefined,
	onboarding: createDraft("none"),
	mortgageApplication: createMortgageApplicationDraft(),
	setIntent: (intent, options) =>
		set({
			currentIntent: intent,
			sourceListingId: options?.sourceListingId,
			onboarding: createDraft(intent),
		}),
	setSourceListingId: (sourceListingId) => set({ sourceListingId }),
	updateOnboardingField: (field, value) =>
		set((state) => ({
			onboarding: {
				...state.onboarding,
				fields: {
					...state.onboarding.fields,
					[field]: value,
				},
			},
		})),
	nextOnboardingStep: () =>
		set((state) => ({
			onboarding: {
				...state.onboarding,
				currentStep: Math.min(
					state.onboarding.currentStep + 1,
					maxStepIndexByIntent[state.onboarding.intent]
				),
			},
		})),
	previousOnboardingStep: () =>
		set((state) => ({
			onboarding: {
				...state.onboarding,
				currentStep: Math.max(0, state.onboarding.currentStep - 1),
			},
		})),
	submitOnboarding: () =>
		set((state) => ({
			onboarding: {
				...state.onboarding,
				isSubmitted: true,
			},
		})),
	updateMortgageApplicationField: (field, value) =>
		set((state) => ({
			mortgageApplication: {
				...state.mortgageApplication,
				fields: {
					...state.mortgageApplication.fields,
					[field]: value,
				},
			},
		})),
	nextMortgageApplicationStep: () =>
		set((state) => ({
			mortgageApplication: {
				...state.mortgageApplication,
				currentStep: Math.min(
					state.mortgageApplication.currentStep + 1,
					mortgageApplicationLastStepIndex
				),
			},
		})),
	previousMortgageApplicationStep: () =>
		set((state) => ({
			mortgageApplication: {
				...state.mortgageApplication,
				currentStep: Math.max(0, state.mortgageApplication.currentStep - 1),
			},
		})),
	submitMortgageApplication: () =>
		set((state) => ({
			mortgageApplication: {
				...state.mortgageApplication,
				isSubmitted: true,
			},
		})),
	resetMortgageApplication: () =>
		set({ mortgageApplication: createMortgageApplicationDraft() }),
	resetFlow: () =>
		set({
			currentIntent: "none",
			sourceListingId: undefined,
			onboarding: createDraft("none"),
			mortgageApplication: createMortgageApplicationDraft(),
		}),
	hydrateForTesting: (nextState) =>
		set((state) => ({
			...state,
			...nextState,
			onboarding: {
				...state.onboarding,
				...nextState.onboarding,
				fields: {
					...state.onboarding.fields,
					...nextState.onboarding?.fields,
				},
			},
			mortgageApplication: nextState.mortgageApplication
				? {
						...state.mortgageApplication,
						...nextState.mortgageApplication,
						fields: {
							...state.mortgageApplication.fields,
							...(nextState.mortgageApplication.fields ?? {}),
						},
					}
				: state.mortgageApplication,
		})),
}));

export function getBrokerListingById(listingId?: string) {
	if (!listingId) {
		return undefined;
	}

	return useBrokerWhiteLabelStore
		.getState()
		.listings.find((listing) => listing.id === listingId);
}
