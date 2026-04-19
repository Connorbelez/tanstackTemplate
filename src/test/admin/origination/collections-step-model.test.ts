import { describe, expect, it } from "vitest";
import {
	buildBankAccountLabel,
	buildBorrowerDisplayLabel,
	buildIntentDraft,
	buildMortgageHydration,
	buildParticipantsHydration,
	buildProviderManagedDraft,
	COLLECTION_OPTIONS,
	formatCurrency,
	formatStatusLabel,
	resolveExecutionIntent,
} from "#/components/admin/origination/collections-step-model";

describe("collections step model", () => {
	it("exposes only the supported collection strategies", () => {
		expect(COLLECTION_OPTIONS).toHaveLength(2);
		expect(COLLECTION_OPTIONS.map((option) => option.label)).toEqual([
			"App managed via manual",
			"Provider managed via Rotessa payment schedule",
		]);
	});

	it("stages app-owned servicing as manual execution", () => {
		expect(buildIntentDraft({}, "app_owned")).toEqual({
			executionIntent: "app_owned",
			executionStrategy: "manual",
			mode: "app_owned_only",
		});
	});

	it("stages provider-managed servicing with pending activation state", () => {
		expect(
			buildProviderManagedDraft(
				{
					selectedBorrowerId: "borrower_1",
				},
				{
					borrowerSource: "existing",
					scheduleSource: "existing",
					selectedProviderScheduleId: "provider_schedule_1",
				}
			)
		).toEqual({
			activationStatus: "pending",
			borrowerSource: "existing",
			executionIntent: "provider_managed_now",
			mode: "provider_managed_now",
			providerCode: "pad_rotessa",
			providerManagedActivationStatus: "pending",
			scheduleSource: "existing",
			selectedBorrowerId: "borrower_1",
			selectedProviderScheduleId: "provider_schedule_1",
		});
	});

	it("resolves execution intent from either the new field or the legacy mode alias", () => {
		expect(resolveExecutionIntent({ executionIntent: "app_owned" })).toBe(
			"app_owned"
		);
		expect(resolveExecutionIntent({ mode: "provider_managed_now" })).toBe(
			"provider_managed_now"
		);
		expect(resolveExecutionIntent(undefined)).toBeUndefined();
	});

	it("hydrates canonical borrower and mortgage details from an external schedule selection", () => {
		expect(
			buildParticipantsHydration(
				{
					primaryBorrower: {
						email: "previous@example.com",
						fullName: "Previous Borrower",
					},
				},
				{
					borrowerId: "borrower_1",
					email: "ada@example.com",
					fullName: "Ada Lovelace",
				}
			)
		).toEqual({
			primaryBorrower: {
				email: "ada@example.com",
				existingBorrowerId: "borrower_1",
				fullName: "Ada Lovelace",
			},
		});

		expect(
			buildMortgageHydration(
				{
					principal: 250_000,
				},
				{
					firstPaymentDate: "2026-06-01",
					originationPaymentFrequency: "monthly",
					paymentAmountCents: 245_000,
				}
			)
		).toEqual({
			firstPaymentDate: "2026-06-01",
			paymentAmount: 245_000,
			paymentFrequency: "monthly",
			principal: 250_000,
		});
	});

	it("formats borrower, bank account, cadence, and currency summaries for the UI", () => {
		expect(
			buildBorrowerDisplayLabel({
				email: "ada@example.com",
				fullName: "Ada Lovelace",
			})
		).toBe("Ada Lovelace");
		expect(
			buildBankAccountLabel({
				accountLast4: "6789",
				institutionNumber: "001",
				transitNumber: "00011",
			})
		).toBe("•••• 6789 • 001-00011");
		expect(formatStatusLabel("accelerated_bi_weekly")).toBe(
			"Accelerated Bi Weekly"
		);
		expect(formatCurrency(245_000)).toBe("$2,450.00");
		expect(formatCurrency(null)).toBe("Not staged");
	});
});
