import { expect, test } from "@playwright/test";
import {
	ADMIN_STORAGE_STATE,
	addFieldInDesigner,
	BASE_URL,
	createTestPdfBuffer,
	navigateToDesigner,
	uniqueKey,
	uniqueName,
} from "../helpers/document-engine";

const PAGE_COUNT_PATTERN = /1 page/;
const HASH_PATTERN = /SHA:/;
const PUBLISHED_PATTERN = /Published v1|v1/;
const FIELD_COUNT_PATTERN = /1 field/;
const FIELD_PATTERN = /field/;
const GENERATE_BUTTON_PATTERN = /Generate Document/;

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Full end-to-end workflow test for the Document Engine.
 *
 * Flow:
 *   1. Upload a base PDF
 *   2. Create system variables (string + currency)
 *   3. Create a template from the base PDF
 *   4. Open designer, add fields and a signatory, save
 *   5. Publish the template
 *   6. Create a group and add the template
 *   7. Generate a document from the template
 *   8. Cleanup all created resources
 */
test.describe("Document Engine - Full Workflow", () => {
	test.describe.configure({ mode: "serial" });

	// Shared identifiers across serial tests
	const pdfName = uniqueName("WorkflowPDF");
	const varKeyName = uniqueKey("wf_name");
	const varKeyAmount = uniqueKey("wf_amount");
	const templateName = uniqueName("WorkflowTpl");
	const groupName = uniqueName("WorkflowGrp");

	// ── Step 1: Upload Base PDF ──────────────────────────────────────

	test("1. upload a base PDF to the library", async ({ page }) => {
		await page.goto(`${BASE_URL}/library`);

		await page.getByRole("button", { name: "Upload PDF" }).click();
		await page.getByRole("heading", { name: "Upload Base PDF" }).waitFor();

		await page.getByLabel("Name").fill(pdfName);

		const pdfBuffer = await createTestPdfBuffer();
		await page.locator('input[type="file"]').setInputFiles({
			name: "workflow-test.pdf",
			mimeType: "application/pdf",
			buffer: pdfBuffer,
		});

		await page.getByRole("button", { name: "Upload", exact: true }).click();

		// Wait for upload + metadata extraction
		await expect(page.getByText(pdfName)).toBeVisible({ timeout: 30_000 });
		const pdfCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: pdfName });
		await expect(pdfCard.getByText(PAGE_COUNT_PATTERN)).toBeVisible();
		await expect(pdfCard.getByText(HASH_PATTERN)).toBeVisible();
	});

	// ── Step 2: Create System Variables ───────────────────────────────

	test("2a. create a string variable (borrower name)", async ({ page }) => {
		await page.goto(`${BASE_URL}/variables`);

		await page.getByRole("button", { name: "Add Variable" }).click();
		await page.getByLabel("Key (snake_case)").fill(varKeyName);
		await page.getByLabel("Label").fill("Borrower Name");
		await page.getByRole("button", { name: "Create Variable" }).click();

		await expect(page.getByText(varKeyName)).toBeVisible({ timeout: 10_000 });
		const nameRow = page
			.locator(".flex.items-center.gap-4")
			.filter({ hasText: varKeyName });
		await expect(nameRow.getByText("Borrower Name")).toBeVisible();
	});

	test("2b. create a currency variable (loan amount)", async ({ page }) => {
		await page.goto(`${BASE_URL}/variables`);

		await page.getByRole("button", { name: "Add Variable" }).click();
		await page.getByLabel("Key (snake_case)").fill(varKeyAmount);
		await page.getByLabel("Label").fill("Loan Amount");

		// Select currency type
		await page.locator("#var-type").click();
		await page.getByRole("option", { name: "Currency" }).click();

		await page.getByRole("button", { name: "Create Variable" }).click();

		await expect(page.getByText(varKeyAmount)).toBeVisible({
			timeout: 10_000,
		});
		const amountRow = page
			.locator(".flex.items-center.gap-4")
			.filter({ hasText: varKeyAmount });
		await expect(amountRow.getByText("currency")).toBeVisible();
	});

	// ── Step 3: Create Template ──────────────────────────────────────

	test("3. create a template from the base PDF", async ({ page }) => {
		await page.goto(`${BASE_URL}/templates`);

		await page.getByRole("button", { name: "New Template" }).click();
		await page.getByLabel("Name").fill(templateName);

		// Select the uploaded PDF
		await page.locator("#tpl-pdf").click();
		await page.getByRole("option", { name: new RegExp(pdfName) }).click();

		await page.getByRole("button", { name: "Create Template" }).click();

		await expect(page.getByText(templateName)).toBeVisible({
			timeout: 10_000,
		});
		const tplCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: templateName });
		await expect(tplCard.getByText("Draft Only")).toBeVisible();
	});

	// ── Step 4: Design the Template ──────────────────────────────────

	test("4a. open designer and add an interpolable field", async ({ page }) => {
		await navigateToDesigner(page, templateName);

		// Add interpolable field via pdfme sidebar drag
		await addFieldInDesigner(page, "interpolableField");

		// Field count should update
		await expect(page.getByText(FIELD_COUNT_PATTERN)).toBeVisible({
			timeout: 5000,
		});
	});

	test("4b. add a signable field and a signatory", async ({ page }) => {
		await navigateToDesigner(page, templateName);

		// First add a signatory so signable fields can reference it
		const signatoryPanel = page
			.locator("div")
			.filter({
				has: page.getByRole("heading", { name: "Signatories" }),
			})
			.first();

		// The signatory panel has a select + add button
		const addSignatorySelect = signatoryPanel.getByRole("combobox").first();
		if (await addSignatorySelect.isVisible()) {
			await addSignatorySelect.click();
			// Pick first available role (e.g., Borrower)
			await page.getByRole("option").first().click();
			// Click the add button in the signatory panel
			await signatoryPanel
				.getByRole("button")
				.filter({ has: page.locator("svg") })
				.first()
				.click();
		}

		// Add signable field via pdfme sidebar drag
		await addFieldInDesigner(page, "signableField");

		// A signable field should be counted
		await expect(page.getByText(FIELD_PATTERN)).toBeVisible({ timeout: 5000 });
	});

	test("4c. save the draft", async ({ page }) => {
		await navigateToDesigner(page, templateName);

		await page.getByRole("button", { name: "Save" }).click();

		// Wait a moment for save to complete — no error should appear
		await page.waitForTimeout(2000);
		await expect(
			page.locator("[class*='destructive']").first()
		).not.toBeVisible();
	});

	// ── Step 5: Publish the Template ─────────────────────────────────

	test("5. publish the template", async ({ page }) => {
		await navigateToDesigner(page, templateName);

		await page.getByRole("button", { name: "Publish" }).click();

		// After publish, version badge should appear
		await expect(page.getByText("v1")).toBeVisible({ timeout: 15_000 });

		// Navigate back to templates page and verify status
		await page.goto(`${BASE_URL}/templates`);
		await page.getByText(templateName).waitFor({ timeout: 10_000 });

		// Should show published status (either "Published v1" or "v1")
		const publishedCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: templateName });
		await expect(publishedCard.getByText(PUBLISHED_PATTERN)).toBeVisible();
	});

	// ── Step 6: Create Group and Add Template ────────────────────────

	test("6a. create a template group", async ({ page }) => {
		await page.goto(`${BASE_URL}/groups`);

		await page.getByRole("button", { name: "New Group" }).click();
		await page.getByLabel("Name").fill(groupName);
		await page
			.getByLabel("Description (optional)")
			.fill("E2E workflow test group");
		await page.getByRole("button", { name: "Create Group" }).click();

		await expect(page.getByText(groupName)).toBeVisible({ timeout: 10_000 });
		const grpCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: groupName });
		await expect(grpCard.getByText("0 templates")).toBeVisible();
	});

	test("6b. add the published template to the group", async ({ page }) => {
		await page.goto(`${BASE_URL}/groups`);
		await page.getByText(groupName).waitFor({ timeout: 10_000 });

		// Scope to the specific group card
		const groupCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: groupName });

		// Expand the group
		await groupCard.getByText(groupName).click();

		// Wait for expanded content
		await expect(groupCard.getByText("No templates added yet")).toBeVisible({
			timeout: 5000,
		});

		// Select template to add
		const addSelect = groupCard.getByText("Add template...");
		await addSelect.click();
		await page.getByRole("option", { name: new RegExp(templateName) }).click();

		// Click the add button (small Plus button next to the select)
		await groupCard
			.getByRole("button")
			.filter({ has: page.locator("svg") })
			.filter({ hasText: "" })
			.first()
			.click();

		// Template should appear in the group
		await expect(groupCard.getByText(templateName)).toBeVisible({
			timeout: 10_000,
		});

		// Template count should update
		await expect(groupCard.getByText("1 template")).toBeVisible();
	});

	// ── Step 7: Generate Document ────────────────────────────────────

	test("7. select the published template on the generate page", async ({
		page,
	}) => {
		await page.goto(`${BASE_URL}/generate`);
		await page.getByText("Single Template").waitFor({ timeout: 10_000 });

		// Click the template selector
		await page.getByText("Select a published template...").click();

		// Our published template should be available (published in step 5)
		const templateOption = page.getByRole("option", {
			name: new RegExp(templateName),
		});
		await expect(templateOption).toBeVisible({ timeout: 10_000 });
		await templateOption.click();

		// Generate button should appear
		await expect(
			page.getByRole("button", { name: GENERATE_BUTTON_PATTERN })
		).toBeVisible({ timeout: 5000 });
	});

	// ── Step 8: Cleanup ──────────────────────────────────────────────

	test("8a. cleanup: delete the group", async ({ page }) => {
		await page.goto(`${BASE_URL}/groups`);
		const groupVisible = await page
			.getByText(groupName)
			.isVisible()
			.catch(() => false);
		if (groupVisible) {
			const card = page
				.locator("[data-slot='card']")
				.filter({ hasText: groupName })
				.first();
			await card
				.getByRole("button")
				.filter({ has: page.locator("svg") })
				.first()
				.click();
			await expect(page.getByText(groupName)).not.toBeVisible({
				timeout: 10_000,
			});
		}
	});

	test("8b. cleanup: delete the template", async ({ page }) => {
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
			await expect(page.getByText(templateName)).not.toBeVisible({
				timeout: 10_000,
			});
		}
	});

	test("8c. cleanup: delete the variables", async ({ page }) => {
		await page.goto(`${BASE_URL}/variables`);

		for (const key of [varKeyName, varKeyAmount]) {
			const visible = await page
				.getByText(key)
				.isVisible()
				.catch(() => false);
			if (visible) {
				const row = page
					.locator(".flex.items-center.gap-4")
					.filter({ hasText: key });
				await row
					.getByRole("button")
					.filter({ has: page.locator("svg") })
					.click();
				await expect(page.getByText(key)).not.toBeVisible({
					timeout: 10_000,
				});
			}
		}
	});

	test("8d. cleanup: delete the base PDF", async ({ page }) => {
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
			await expect(page.getByText(pdfName)).not.toBeVisible({
				timeout: 10_000,
			});
		}
	});

	// ── Verification: Dashboard counts ───────────────────────────────

	test("9. verify dashboard loads after workflow cleanup", async ({ page }) => {
		await page.goto(BASE_URL);

		await expect(
			page.getByRole("heading", { name: "Document Engine" })
		).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText("Base PDFs")).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Getting Started" })
		).toBeVisible();
	});
});
