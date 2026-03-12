import { expect, test } from "@playwright/test";
import {
	BASE_URL,
	createTestPdfBuffer,
	uniqueName,
} from "../helpers/document-engine";

const PAGE_COUNT_PATTERN = /1 page/;
const FILE_SIZE_PATTERN = /KB/;
const HASH_PATTERN = /SHA:/;

test.describe("Document Engine - Base PDF Library", () => {
	test("library page renders with heading and upload button", async ({
		page,
	}) => {
		await page.goto(`${BASE_URL}/library`);

		await expect(
			page.getByRole("heading", { name: "Base PDF Library" })
		).toBeVisible({ timeout: 10_000 });
		await expect(
			page.getByRole("button", { name: "Upload PDF" })
		).toBeVisible();
	});

	test("upload dialog opens with correct form elements", async ({ page }) => {
		await page.goto(`${BASE_URL}/library`);

		await page.getByRole("button", { name: "Upload PDF" }).click();

		// Dialog heading
		await expect(
			page.getByRole("heading", { name: "Upload Base PDF" })
		).toBeVisible();

		// Form elements
		await expect(page.getByLabel("Name")).toBeVisible();
		await expect(page.getByLabel("PDF File")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Upload", exact: true })
		).toBeVisible();
	});

	test("can upload a PDF and see it in the library", async ({ page }) => {
		const pdfName = uniqueName("TestPDF");
		await page.goto(`${BASE_URL}/library`);

		// Open dialog
		await page.getByRole("button", { name: "Upload PDF" }).click();
		await page.getByRole("heading", { name: "Upload Base PDF" }).waitFor();

		// Fill name
		await page.getByLabel("Name").fill(pdfName);

		// Set file
		const pdfBuffer = await createTestPdfBuffer();
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles({
			name: "test.pdf",
			mimeType: "application/pdf",
			buffer: pdfBuffer,
		});

		// Upload
		await page.getByRole("button", { name: "Upload", exact: true }).click();

		// Verify PDF appears in the library (metadata extraction can take time)
		await expect(page.getByText(pdfName)).toBeVisible({ timeout: 30_000 });

		// Scope assertions to the card with our unique PDF name
		const pdfCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: pdfName });

		// Should show page count and file size
		await expect(pdfCard.getByText(PAGE_COUNT_PATTERN)).toBeVisible();
		await expect(pdfCard.getByText(FILE_SIZE_PATTERN)).toBeVisible();

		// Should show SHA hash prefix
		await expect(pdfCard.getByText(HASH_PATTERN)).toBeVisible();

		// Cleanup: delete the PDF
		const card = page
			.locator("[data-slot='card']")
			.filter({ hasText: pdfName })
			.first();
		await card
			.getByRole("button")
			.filter({ has: page.locator("svg") })
			.click();

		// Verify removal
		await expect(page.getByText(pdfName)).not.toBeVisible({ timeout: 10_000 });
	});

	test("shows empty state or PDF cards after data loads", async ({ page }) => {
		await page.goto(`${BASE_URL}/library`);

		// Wait for the page to finish loading data (heading is always present)
		await expect(
			page.getByRole("heading", { name: "Base PDF Library" })
		).toBeVisible({ timeout: 10_000 });

		// Wait a moment for Convex query to resolve
		await page.waitForTimeout(2000);

		// Check if empty state text OR PDF cards exist
		const hasEmptyState = await page
			.getByText("No PDFs uploaded yet")
			.isVisible()
			.catch(() => false);
		const hasPdfCards = await page
			.locator("[data-slot='card']")
			.first()
			.isVisible()
			.catch(() => false);

		// One of these must be true after data loads
		expect(hasEmptyState || hasPdfCards).toBeTruthy();
	});
});
