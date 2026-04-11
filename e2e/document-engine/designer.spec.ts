import { expect, test } from "@playwright/test";
import {
	ADMIN_STORAGE_STATE,
	addFieldInDesigner,
	BASE_URL,
	createTemplate,
	expectDesignerRendered,
	openAdminPage,
	navigateToDesigner,
	uniqueName,
	uploadTestPdf,
} from "../helpers/document-engine";

// Matches any non-zero field count like "1 field", "2 fields", etc.
const HAS_FIELDS_PATTERN = /[1-9]\d* fields?/;

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Document Engine - Template Designer", () => {
	test.describe.configure({ mode: "serial" });

	const pdfName = uniqueName("DesignerPDF");
	const templateName = uniqueName("DesignerTpl");

	test.beforeAll(async ({ browser }) => {
		const { context, page } = await openAdminPage(browser);
		await uploadTestPdf(page, pdfName);
		await createTemplate(page, templateName, pdfName);
		await context.close();
	});

	test("designer page loads with template info and toolbar", async ({
		page,
	}) => {
		await navigateToDesigner(page, templateName);

		// Should show template name
		await expect(page.getByText(templateName)).toBeVisible();

		// Toolbar buttons
		await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
	});

	test("pdfme designer initializes and renders", async ({ page }) => {
		await navigateToDesigner(page, templateName);

		// pdfme should have rendered content inside the container
		await expectDesignerRendered(page);
	});

	test("can add an interpolable field via pdfme sidebar", async ({ page }) => {
		await navigateToDesigner(page, templateName);

		// Drag an interpolable field from pdfme's sidebar to the canvas
		await addFieldInDesigner(page, "interpolableField");

		// Our custom UI renderer shows "Interpolable" or "{{...}}" text
		// The field count in the header should update
		await expect(page.getByText(HAS_FIELDS_PATTERN)).toBeVisible({
			timeout: 5000,
		});
	});

	test("can add a signable field via pdfme sidebar", async ({ page }) => {
		await navigateToDesigner(page, templateName);

		// Drag a signable field from pdfme's sidebar to the canvas
		await addFieldInDesigner(page, "signableField");

		// Verify at least one field exists after adding
		await expect(page.getByText(HAS_FIELDS_PATTERN)).toBeVisible({
			timeout: 5000,
		});
	});

	test("can save draft manually", async ({ page }) => {
		await navigateToDesigner(page, templateName);

		// Click save button
		await page.getByRole("button", { name: "Save" }).click();

		// No error toast/alert should appear
		await expect(page.getByRole("alert")).not.toBeVisible({ timeout: 5000 });
	});

	test("field config panel shows when no field is selected", async ({
		page,
	}) => {
		await navigateToDesigner(page, templateName);

		// Right sidebar should show field properties section
		await expect(page.getByText("Field Properties")).toBeVisible();

		// With no field selected, show placeholder text
		await expect(
			page.getByText("Select a field to edit its properties")
		).toBeVisible();
	});

	test("signatory panel is visible in the designer", async ({ page }) => {
		await navigateToDesigner(page, templateName);

		await expect(page.getByText("Signatories", { exact: true })).toBeVisible();
		await expect(page.getByText("No signatories added yet.")).toBeVisible();
	});

	test.afterAll(async ({ browser }) => {
		const { context, page } = await openAdminPage(browser);

		// Delete template
		await page.goto(`${BASE_URL}/templates`);
		const templateVisible = await page
			.getByText(templateName)
			.isVisible()
			.catch(() => false);
		if (templateVisible) {
			const card = page
				.locator("[data-slot='card']")
				.filter({ hasText: templateName })
				.first();
			await card
				.getByRole("button")
				.filter({ has: page.locator('[class*="size-4"]') })
				.last()
				.click();
			await page
				.getByText(templateName)
				.waitFor({ state: "hidden", timeout: 10_000 });
		}

		// Delete PDF
		await page.goto(`${BASE_URL}/library`);
		const pdfVisible = await page
			.getByText(pdfName)
			.isVisible()
			.catch(() => false);
		if (pdfVisible) {
			const card = page
				.locator("[data-slot='card']")
				.filter({ hasText: pdfName })
				.first();
			await card
				.getByRole("button")
				.filter({ has: page.locator("svg") })
				.click();
		}

		await context.close();
	});
});
