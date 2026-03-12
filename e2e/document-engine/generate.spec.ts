import { expect, test } from "@playwright/test";
import { BASE_URL } from "../helpers/document-engine";

const GENERATE_BUTTON_PATTERN = /Generate/;

test.describe("Document Engine - Generate Page", () => {
	test("generate page renders with mode toggle and source selector", async ({
		page,
	}) => {
		await page.goto(`${BASE_URL}/generate`);

		await expect(page.getByText("Generate Documents")).toBeVisible({
			timeout: 10_000,
		});

		// Source card with toggle
		await expect(
			page.locator("[data-slot='card-title']", { hasText: "Source" })
		).toBeVisible();

		// Mode label
		await expect(page.getByText("Single Template")).toBeVisible();

		// Template selector placeholder
		await expect(
			page.getByText("Select a published template...")
		).toBeVisible();
	});

	test("can toggle between template and group mode", async ({ page }) => {
		await page.goto(`${BASE_URL}/generate`);
		await page.getByText("Single Template").waitFor({ timeout: 10_000 });

		// Toggle to group mode
		await page.getByRole("switch").click();

		// Mode label should change
		await expect(page.getByText("Template Group")).toBeVisible();

		// Placeholder should change
		await expect(page.getByText("Select a group...")).toBeVisible();

		// Toggle back
		await page.getByRole("switch").click();
		await expect(page.getByText("Single Template")).toBeVisible();
	});

	test("generate button not shown before selection", async ({ page }) => {
		await page.goto(`${BASE_URL}/generate`);
		await page.getByText("Single Template").waitFor({ timeout: 10_000 });

		// Generate button should not be visible when nothing is selected
		await expect(
			page.getByRole("button", { name: GENERATE_BUTTON_PATTERN })
		).not.toBeVisible();
	});
});
