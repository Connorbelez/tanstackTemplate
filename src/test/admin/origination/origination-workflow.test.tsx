/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentsStep } from "#/components/admin/origination/DocumentsStep";
import { ReviewStep } from "#/components/admin/origination/ReviewStep";
import {
	buildOriginationStepperItems,
	resolveOriginationCommitStateFromRecord,
	resolveOriginationReviewValues,
} from "#/components/admin/origination/workflow";

afterEach(() => {
	cleanup();
});

describe("origination workflow helpers", () => {
	it("derives workflow statuses from saved validation output", () => {
		const items = buildOriginationStepperItems({
			currentStep: "property",
			snapshot: {
				stepErrors: {
					mortgageTerms: ["Principal is required."],
				},
			},
			values: {
				currentStep: "property",
				participantsDraft: {
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
					valueAsIs: 425_000,
				},
			},
		});

		expect(items.find((item) => item.key === "participants")?.status).toBe(
			"complete"
		);
		expect(items.find((item) => item.key === "property")?.status).toBe(
			"in_progress"
		);
		expect(items.find((item) => item.key === "mortgageTerms")?.status).toBe(
			"warning"
		);
		expect(items.find((item) => item.key === "documents")?.status).toBe(
			"not_started"
		);
	});

	it("renders the four phase-1 document placeholders", () => {
		render(<DocumentsStep />);

		expect(screen.getByText("Public static docs")).toBeTruthy();
		expect(screen.getByText("Private static docs")).toBeTruthy();
		expect(
			screen.getByText("Private templated non-signable docs")
		).toBeTruthy();
		expect(screen.getByText("Private templated signable docs")).toBeTruthy();
	});

	it("renders persisted review data and enables commit when blockers are clear", () => {
		const onCommit = vi.fn();

		render(
			<ReviewStep
				canCommit
				commitState={{ status: "idle" }}
				onCommit={onCommit}
				snapshot={{
					reviewWarnings: ["Signed title review package is still pending."],
				}}
				values={{
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
						valueAsIs: 425_000,
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
					collectionsDraft: {
						mode: "app_owned_only",
					},
					listingOverrides: {
						title: "King West bridge opportunity",
						description: "Senior secured mortgage opportunity.",
					},
				}}
			/>
		);

		expect(screen.getByText(/Ada Lovelace, ada@example\.com/i)).toBeTruthy();
		expect(screen.getByText("King West bridge opportunity")).toBeTruthy();
		expect(
			screen.getByText(/Signed title review package is still pending\./i)
		).toBeTruthy();

		const commitButton = screen.getByRole("button", {
			name: /Commit origination/i,
		});
		expect(commitButton.hasAttribute("disabled")).toBe(false);

		fireEvent.click(commitButton);
		expect(onCommit).toHaveBeenCalledTimes(1);
	});

	it("renders awaiting identity sync guidance without blocking retry", () => {
		render(
			<ReviewStep
				canCommit
				commitState={{
					pendingIdentities: [
						{
							email: "ada@example.com",
							fullName: "Ada Lovelace",
							role: "primary",
						},
					],
					status: "awaiting_identity_sync",
				}}
				onCommit={() => undefined}
				snapshot={{
					reviewWarnings: [
						"Provider-managed now will attempt immediate Rotessa activation after canonical commit. The mortgage still commits even if activation fails, and the payment setup screen will surface status and retry.",
					],
				}}
				values={{
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
						valueAsIs: 425_000,
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
				}}
			/>
		);

		expect(screen.getByText(/Identity sync is still pending/i)).toBeTruthy();
		expect(screen.getByText(/Ada Lovelace \(ada@example\.com\)/i)).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /Commit origination/i }).hasAttribute(
				"disabled"
			)
		).toBe(false);
	});

	it("renders distinct validating, committing, and failed commit states", () => {
		const { rerender } = render(
			<ReviewStep
				canCommit
				commitState={{ status: "validating" }}
				onCommit={() => undefined}
				snapshot={{}}
				values={{
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
						valueAsIs: 425_000,
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
				}}
			/>
		);

		expect(
			screen.getByRole("button", { name: /Validating persisted draft/i })
		).toBeTruthy();

		rerender(
			<ReviewStep
				canCommit
				commitState={{ status: "committing" }}
				onCommit={() => undefined}
				snapshot={{}}
				values={{
					participantsDraft: {
						brokerOfRecordId: "broker_123",
						primaryBorrower: {
							email: "ada@example.com",
							fullName: "Ada Lovelace",
						},
					},
				}}
			/>
		);

		expect(
			screen.getByRole("button", { name: /Writing canonical mortgage/i })
		).toBeTruthy();

		rerender(
			<ReviewStep
				canCommit
				commitState={{
					message: "Broker of record no longer exists.",
					status: "failed",
				}}
				onCommit={() => undefined}
				snapshot={{}}
				values={{
					participantsDraft: {
						brokerOfRecordId: "broker_123",
						primaryBorrower: {
							email: "ada@example.com",
							fullName: "Ada Lovelace",
						},
					},
				}}
			/>
		);

		expect(screen.getByText(/Commit failed/i)).toBeTruthy();
		expect(
			screen.getByText(/Broker of record no longer exists\./i)
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /Commit origination/i }).hasAttribute(
				"disabled"
			)
		).toBe(false);
	});

	it("prefers persisted case values over optimistic local edits on the review step", () => {
		const values = resolveOriginationReviewValues(
			{
				listingOverrides: {
					title: "Persisted title",
				},
			},
			{
				listingOverrides: {
					title: "Optimistic only",
				},
			}
		);

		expect(values.listingOverrides?.title).toBe("Persisted title");
	});

	it("rehydrates persisted commit statuses from the saved case record", () => {
		expect(
			resolveOriginationCommitStateFromRecord({
				_id: "case_1",
				committedMortgageId: "mortgage_1",
				createdAt: 0,
				status: "committed",
				updatedAt: 0,
			})
		).toEqual({
			committedMortgageId: "mortgage_1",
			status: "committed",
		});

		expect(
			resolveOriginationCommitStateFromRecord({
				_id: "case_2",
				createdAt: 0,
				lastCommitError: "Broker of record no longer exists.",
				status: "failed",
				updatedAt: 0,
			})
		).toEqual({
			message: "Broker of record no longer exists.",
			status: "failed",
		});

		expect(
			resolveOriginationCommitStateFromRecord({
				_id: "case_3",
				createdAt: 0,
				status: "awaiting_identity_sync",
				updatedAt: 0,
			})
		).toEqual({
			pendingIdentities: [],
			status: "awaiting_identity_sync",
		});
	});
});
