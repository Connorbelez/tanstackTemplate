/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DocumentsStep } from "#/components/admin/origination/DocumentsStep";
import { ReviewStep } from "#/components/admin/origination/ReviewStep";
import {
	buildOriginationStepperItems,
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

	it("renders staged review data and keeps commit disabled", () => {
		render(
			<ReviewStep
				snapshot={{
					reviewWarnings: [
						"Commit stays disabled until every required phase-1 field is staged.",
					],
					stepErrors: {
						mortgageTerms: ["Principal is required."],
					},
				}}
				values={{
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
		expect(screen.getAllByText(/Commit stays disabled/i).length).toBeGreaterThan(
			0
		);
		const button = screen.getByRole("button", {
			name: /Commit origination/i,
		});

		expect(button.hasAttribute("disabled")).toBe(true);
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
});
