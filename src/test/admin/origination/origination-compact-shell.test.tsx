/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OriginationStepCard } from "#/components/admin/origination/OriginationStepCard";
import { OriginationWorkspaceHero } from "#/components/admin/origination/OriginationWorkspaceHero";

afterEach(() => {
	cleanup();
});

describe("origination compact shell", () => {
	it("renders the workspace hero without the older explanatory header copy", () => {
		render(
			<OriginationWorkspaceHero
				actions={<button type="button">Back to drafts</button>}
				caseStatus="draft"
				currentStepLabel="Mortgage terms"
				lastSavedAt={1_777_777_777_000}
				pageTitle="Origination case 855SW2"
				saveState="saved"
			/>
		);

		expect(
			screen.getByRole("heading", { name: "Origination case 855SW2" })
		).toBeTruthy();
		expect(screen.getByText("Mortgage terms")).toBeTruthy();
		expect(
			screen.queryByText(/Draft-first staging for borrower/i)
		).toBeNull();
		expect(screen.queryByRole("button", { name: /Workspace details/i })).toBeNull();
		expect(screen.getByText("Saved")).toBeTruthy();
		expect(screen.getByRole("button", { name: /Back to drafts/i })).toBeTruthy();
	});

	it("renders a compact issue summary and expands the full validation list on demand", () => {
		render(
			<OriginationStepCard
				errors={[
					"Principal is required.",
					"Interest rate is required.",
					"Rate type is required.",
					"Term length is required.",
				]}
				title="Mortgage terms"
			>
				<div>Fields</div>
			</OriginationStepCard>
		);

		expect(screen.getByText("4 issues need attention")).toBeTruthy();
		expect(
			screen.getByText(
				"Principal is required. • Interest rate is required. • +2 more"
			)
		).toBeTruthy();
		expect(screen.queryByText("Term length is required.")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /View all issues/i }));

		expect(screen.getByText("Term length is required.")).toBeTruthy();
	});
});
