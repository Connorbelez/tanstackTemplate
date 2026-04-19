import { describe, expect, it } from "vitest";
import {
	computeOriginationValidationSnapshot,
	determineRecommendedOriginationStep,
	mergeOriginationCaseDraftValues,
	normalizeOriginationCollectionsDraft,
	normalizeOriginationListingOverridesDraft,
	normalizeOriginationMortgageDraft,
	normalizeOriginationParticipantsDraft,
	normalizeOriginationPropertyDraft,
	normalizeOriginationValuationDraft,
} from "../../../../../convex/admin/origination/validators";
import type { OriginationCaseDraftValues } from "#/lib/admin-origination";

describe("origination validators", () => {
	it("deep-merges draft patches and preserves additive unknown fields", () => {
		const existing = {
			collectionsDraft: {
				mode: "provider_managed_now",
				providerCode: "pad_rotessa",
				// Simulates a later-phase additive field the phase-1 UI does not know about.
				activationStatus: "pending",
			},
			currentStep: "participants",
			participantsDraft: {
				primaryBorrower: {
					fullName: "Ada Lovelace",
					email: "ada@example.com",
				},
			},
		} as OriginationCaseDraftValues & {
			collectionsDraft: { activationStatus: string; mode: string; providerCode: string };
		};

		const merged = mergeOriginationCaseDraftValues(existing, {
			currentStep: "collections",
			participantsDraft: {
				primaryBorrower: {
					fullName: "Ada Byron",
				},
			},
		});

		expect(merged.currentStep).toBe("collections");
		expect(merged.participantsDraft?.primaryBorrower?.fullName).toBe("Ada Byron");
		expect(merged.participantsDraft?.primaryBorrower?.email).toBe(
			"ada@example.com"
		);
		expect(
			(
				merged as typeof merged & {
					collectionsDraft?: { activationStatus?: string };
				}
			).collectionsDraft?.activationStatus
		).toBe("pending");
	});

	it("normalizes blank participant rows and trims entered text", () => {
		const normalized = normalizeOriginationParticipantsDraft({
			coBorrowers: [
				{ email: "  ", fullName: "  " },
				{ email: "  grace@example.com ", fullName: "  Grace Hopper " },
			],
			guarantors: [{ phone: "  " }],
			primaryBorrower: {
				email: "  ada@example.com ",
				fullName: "  Ada Lovelace ",
				phone: " ",
			},
		});

		expect(normalized).toEqual({
			coBorrowers: [
				{ email: "grace@example.com", fullName: "Grace Hopper" },
			],
			primaryBorrower: {
				email: "ada@example.com",
				fullName: "Ada Lovelace",
			},
		});
	});

	it("normalizes blank property, valuation, mortgage, collections, and listing fields", () => {
		expect(
			normalizeOriginationPropertyDraft({
				create: {
					city: " Toronto ",
					googlePlaceData: {
						formattedAddress: "123 King St W, Toronto, ON M5H 1J9, Canada",
						placeId: "google-place-1",
					},
					postalCode: " ",
					streetAddress: " 123 King St W ",
				},
			})
		).toEqual({
			create: {
				city: "Toronto",
				googlePlaceData: {
					formattedAddress: "123 King St W, Toronto, ON M5H 1J9, Canada",
					placeId: "google-place-1",
				},
				streetAddress: "123 King St W",
			},
		});

		expect(
			normalizeOriginationValuationDraft({
				valuationDate: " 2026-04-16 ",
			})
		).toEqual({
			valuationDate: "2026-04-16",
		});

		expect(
			normalizeOriginationMortgageDraft({
				interestRate: 9.5,
				maturityDate: " ",
			})
		).toEqual({
			interestRate: 9.5,
		});

		expect(
			normalizeOriginationCollectionsDraft({
				executionIntent: "provider_managed_now",
				borrowerSource: "existing",
				providerCode: "pad_rotessa",
				scheduleSource: "create",
			})
		).toEqual({
			activationStatus: "pending",
			borrowerSource: "existing",
			executionIntent: "provider_managed_now",
			mode: "provider_managed_now",
			providerCode: "pad_rotessa",
			providerManagedActivationStatus: "pending",
			scheduleSource: "create",
		});

		expect(
			normalizeOriginationListingOverridesDraft({
				description: " ",
				heroImages: [
					{
						caption: " Front elevation ",
						storageId: " storage_hero_1 ",
					},
					" ",
				],
				title: " Featured bridge loan ",
			})
		).toEqual({
			heroImages: [
				{
					caption: "Front elevation",
					storageId: "storage_hero_1",
				},
			],
			title: "Featured bridge loan",
		});
	});

	it("produces step validation errors and review warnings for incomplete drafts", () => {
		const snapshot = computeOriginationValidationSnapshot({
			collectionsDraft: {
				executionIntent: "provider_managed_now",
			},
			listingOverrides: { title: "Bridge Loan Opportunity" },
			mortgageDraft: {
				principal: 250_000,
				rateType: "fixed",
				termMonths: 12,
			},
			participantsDraft: {
				brokerOfRecordId: "broker_123",
				primaryBorrower: {
					fullName: "Ada Lovelace",
				},
			},
			propertyDraft: {
				create: {
					streetAddress: "123 King St W",
				},
			},
			valuationDraft: {},
		});

		expect(snapshot.stepErrors?.participants).toContain(
			"Primary borrower email is required."
		);
		expect(snapshot.stepErrors?.property).toContain("Property city is required.");
		expect(snapshot.stepErrors?.mortgageTerms).toContain(
			"Interest rate is required."
		);
		expect(snapshot.stepErrors?.collections).toContain(
			"Immediate Rotessa activation requires a borrower source."
		);
		expect(snapshot.stepErrors?.collections).toContain(
			"Immediate Rotessa activation requires a schedule source."
		);
		expect(snapshot.stepErrors?.collections).toContain(
			"Immediate Rotessa activation requires PAD authorization evidence or an audited override."
		);
		expect(snapshot.reviewWarnings).toContain(
			"Resolve the required participant, property, and mortgage fields before committing this origination case."
		);
		expect(snapshot.reviewWarnings).toContain(
			"Provider-managed now will attempt immediate Rotessa activation after canonical commit. The mortgage still commits even if activation fails, and the payment setup screen will surface status and retry."
		);
	});

	it("requires an execution strategy for app-owned collections", () => {
		const snapshot = computeOriginationValidationSnapshot({
			collectionsDraft: {
				executionIntent: "app_owned",
			},
		});

		expect(snapshot.stepErrors?.collections).toContain(
			"App-owned collections require an execution strategy."
		);
	});

	it("requires PAD authorization before immediate Rotessa activation", () => {
		const snapshot = computeOriginationValidationSnapshot({
			collectionsDraft: {
				borrowerSource: "existing",
				executionIntent: "provider_managed_now",
				providerCode: "pad_rotessa",
				scheduleSource: "existing",
				selectedBorrowerId: "borrower_1",
			},
		});

		expect(snapshot.stepErrors?.collections).toContain(
			"Immediate Rotessa activation requires PAD authorization evidence or an audited override."
		);
	});

	it("preserves additive validation metadata while recomputing phase-1 errors", () => {
		const snapshot = computeOriginationValidationSnapshot({
			currentStep: "review",
			participantsDraft: {
				brokerOfRecordId: "broker_123",
				primaryBorrower: {
					email: "ada@example.com",
					fullName: "Ada Lovelace",
				},
			},
			validationSnapshot: {
				reviewWarnings: ["Future document review is still pending."],
				stepErrors: {
					documents: ["Signed commitment letter is required."],
					participants: ["Outdated participant validation."],
				},
			},
		});

		expect(snapshot.stepErrors?.participants).toBeUndefined();
		expect(snapshot.stepErrors?.documents).toEqual([
			"Signed commitment letter is required.",
		]);
		expect(snapshot.reviewWarnings).toContain(
			"Future document review is still pending."
		);
		expect(snapshot.reviewWarnings).toContain(
			"Resolve the required participant, property, and mortgage fields before committing this origination case."
		);
	});

	it("recommends the first incomplete step when the current step is ahead of missing data", () => {
		expect(
			determineRecommendedOriginationStep({
				currentStep: "review",
			})
		).toBe("participants");

		expect(
			determineRecommendedOriginationStep({
				currentStep: "review",
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
				participantsDraft: {
					brokerOfRecordId: "broker_123",
					primaryBorrower: {
						email: "ada@example.com",
						fullName: "Ada Lovelace",
					},
				},
				propertyDraft: {
					create: {
						city: "Toronto",
						postalCode: "M5H 1J9",
						propertyType: "residential",
						province: "ON",
						streetAddress: "123 King St W",
					},
				},
				valuationDraft: {
					valueAsIs: 400_000,
				},
			})
		).toBe("review");
	});

	it("recommends preserved document validation when phase-1 steps are already complete", () => {
		expect(
			determineRecommendedOriginationStep({
				currentStep: "review",
				collectionsDraft: {
					executionIntent: "app_owned",
					executionStrategy: "manual",
					mode: "app_owned_only",
				},
				listingOverrides: {
					description: "Senior secured mortgage opportunity.",
					title: "Bridge Loan Opportunity",
				},
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
				participantsDraft: {
					brokerOfRecordId: "broker_123",
					primaryBorrower: {
						email: "ada@example.com",
						fullName: "Ada Lovelace",
					},
				},
				propertyDraft: {
					create: {
						city: "Toronto",
						postalCode: "M5H 1J9",
						propertyType: "residential",
						province: "ON",
						streetAddress: "123 King St W",
					},
				},
				validationSnapshot: {
					stepErrors: {
						documents: ["Signed commitment letter is required."],
					},
				},
				valuationDraft: {
					valueAsIs: 400_000,
				},
			})
		).toBe("documents");
	});
});
