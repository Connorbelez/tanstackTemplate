import { beforeEach, describe, expect, it } from "vitest";
import {
	brokerLandingContent,
	brokerListings,
	brokerTheme,
} from "#/routes/demo/broker-whitelabel/-lib/mock-data";
import {
	getBrokerListingById,
	useBrokerWhiteLabelStore,
} from "#/routes/demo/broker-whitelabel/-lib/store";

describe("broker white-label demo store", () => {
	beforeEach(() => {
		useBrokerWhiteLabelStore.getState().resetFlow();
	});

	it("exposes the branded landing content and theme defaults", () => {
		expect(brokerTheme.brokerName).toBe("Meridian Capital");
		expect(brokerLandingContent.hero.headline).toMatch(
			/Canadian Mortgage Opportunities/
		);
		expect(brokerLandingContent.borrowerPreApproval.heading).toBe(
			"Start your pre-approval with Meridian"
		);
		expect(brokerListings).toHaveLength(3);
		expect(getBrokerListingById("first-mortgage-north-york")?.title).toBe(
			"Detached Home, North York"
		);
	});

	it("routes listing access through lender intent with a selected source listing", () => {
		const store = useBrokerWhiteLabelStore.getState();

		store.setIntent("lender", {
			sourceListingId: "first-mortgage-north-york",
		});

		const state = useBrokerWhiteLabelStore.getState();
		expect(state.currentIntent).toBe("lender");
		expect(state.sourceListingId).toBe("first-mortgage-north-york");
		expect(state.onboarding.intent).toBe("lender");
		expect(state.onboarding.currentStep).toBe(0);
	});

	it("updates and preserves onboarding state across step navigation", () => {
		const store = useBrokerWhiteLabelStore.getState();

		store.setIntent("borrower");
		store.updateOnboardingField("firstName", "Casey");
		store.updateOnboardingField("mortgageAmount", "$925,000");
		store.nextOnboardingStep();
		store.nextOnboardingStep();
		store.previousOnboardingStep();

		const state = useBrokerWhiteLabelStore.getState();
		expect(state.currentIntent).toBe("borrower");
		expect(state.onboarding.currentStep).toBe(1);
		expect(state.onboarding.fields.firstName).toBe("Casey");
		expect(state.onboarding.fields.mortgageAmount).toBe("$925,000");
	});

	it("submits and resets the onboarding flow cleanly", () => {
		const store = useBrokerWhiteLabelStore.getState();

		store.setIntent("mortgage-applicant", {
			sourceListingId: "second-mortgage-vaughan",
		});
		store.submitOnboarding();

		expect(useBrokerWhiteLabelStore.getState().onboarding.isSubmitted).toBe(true);

		store.resetFlow();

		const resetState = useBrokerWhiteLabelStore.getState();
		expect(resetState.currentIntent).toBe("none");
		expect(resetState.sourceListingId).toBeUndefined();
		expect(resetState.onboarding.isSubmitted).toBe(false);
		expect(resetState.onboarding.intent).toBe("none");
	});

	it("advances the landing mortgage application slice independently of auth intent", () => {
		const store = useBrokerWhiteLabelStore.getState();

		store.updateMortgageApplicationField("propertyAddress", "123 Maple Dr");
		store.nextMortgageApplicationStep();

		const mid = useBrokerWhiteLabelStore.getState().mortgageApplication;
		expect(mid.currentStep).toBe(1);
		expect(mid.fields.propertyAddress).toBe("123 Maple Dr");
		expect(useBrokerWhiteLabelStore.getState().currentIntent).toBe("none");

		store.resetFlow();
		const cleared = useBrokerWhiteLabelStore.getState().mortgageApplication;
		expect(cleared.currentStep).toBe(0);
		expect(cleared.fields.propertyAddress).toBe("");
	});
});
