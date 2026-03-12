import { expect, test } from "@playwright/test";
import {
	BASE_URL,
	uniqueName,
	uploadTestPdf,
} from "../helpers/document-engine";

const DESIGNER_URL_PATTERN = /\/designer\//;

test.describe("Document Engine - Templates", () => {
	const pdfName = uniqueName("TemplatePDF");

	test.beforeAll(async ({ browser }) => {
		// Upload a base PDF so templates can be created
		const page = await browser.newPage();
		await uploadTestPdf(page, pdfName);
		await page.close();
	});

	test("templates page renders with heading", async ({ page }) => {
		await page.goto(`${BASE_URL}/templates`);

		await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible({
			timeout: 10_000,
		});
	});

	test("new template button is enabled when base PDFs exist", async ({
		page,
	}) => {
		await page.goto(`${BASE_URL}/templates`);

		await expect(
			page.getByRole("button", { name: "New Template" })
		).toBeEnabled({ timeout: 10_000 });
	});

	test("create dialog shows available base PDFs", async ({ page }) => {
		await page.goto(`${BASE_URL}/templates`);

		await page.getByRole("button", { name: "New Template" }).click();
		await expect(
			page.getByRole("heading", { name: "Create Template" })
		).toBeVisible();

		// Click the PDF selector
		await page.locator("#tpl-pdf").click();

		// Should show our uploaded PDF
		await expect(
			page.getByRole("option", { name: new RegExp(pdfName) })
		).toBeVisible();

		// Close the dropdown
		await page.keyboard.press("Escape");
	});

	test("can create a template and see it with Draft Only status", async ({
		page,
	}) => {
		const templateName = uniqueName("TestTemplate");
		await page.goto(`${BASE_URL}/templates`);

		await page.getByRole("button", { name: "New Template" }).click();

		await page.getByLabel("Name").fill(templateName);

		// Select base PDF
		await page.locator("#tpl-pdf").click();
		await page.getByRole("option", { name: new RegExp(pdfName) }).click();

		await page.getByRole("button", { name: "Create Template" }).click();

		// Verify template appears
		await expect(page.getByText(templateName)).toBeVisible({
			timeout: 10_000,
		});

		// Scope to the specific template card
		const tplCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: templateName });

		// Should show "Draft Only" status badge
		await expect(tplCard.getByText("Draft Only")).toBeVisible();

		// Should show "0 fields · 0 signatories"
		await expect(tplCard.getByText("0 fields")).toBeVisible();

		// Cleanup: delete the template
		const card = page
			.locator("[data-slot='card']")
			.filter({ hasText: templateName })
			.first();
		await card
			.getByRole("button")
			.filter({ has: page.locator('[class*="size-4"]') })
			.last()
			.click();

		await expect(page.getByText(templateName)).not.toBeVisible({
			timeout: 10_000,
		});
	});

	test("can navigate to designer from template card", async ({ page }) => {
		const templateName = uniqueName("DesignNav");
		await page.goto(`${BASE_URL}/templates`);

		// Create a template
		await page.getByRole("button", { name: "New Template" }).click();
		await page.getByLabel("Name").fill(templateName);
		await page.locator("#tpl-pdf").click();
		await page.getByRole("option", { name: new RegExp(pdfName) }).click();
		await page.getByRole("button", { name: "Create Template" }).click();
		await page.getByText(templateName).waitFor({ timeout: 10_000 });

		// Click "Design" button
		const tplCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: templateName })
			.first();
		await tplCard.getByRole("button", { name: "Design" }).click();

		// Should navigate to designer
		await expect(page).toHaveURL(DESIGNER_URL_PATTERN);
		await expect(page.getByText(templateName)).toBeVisible({
			timeout: 15_000,
		});

		// Go back and cleanup
		await page.goto(`${BASE_URL}/templates`);
		await page.getByText(templateName).waitFor({ timeout: 10_000 });
		const cleanupCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: templateName })
			.first();
		await cleanupCard
			.getByRole("button")
			.filter({ has: page.locator('[class*="size-4"]') })
			.last()
			.click();
	});

	test.afterAll(async ({ browser }) => {
		// Cleanup the base PDF
		const page = await browser.newPage();
		await page.goto(`${BASE_URL}/library`);
		await page.getByText(pdfName).waitFor({ timeout: 10_000 });
		const card = page
			.locator("[data-slot='card']")
			.filter({ hasText: pdfName })
			.first();
		await card
			.getByRole("button")
			.filter({ has: page.locator("svg") })
			.click();
		await page.close();
	});
});
