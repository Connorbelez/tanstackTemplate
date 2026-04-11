import { expect, test } from "@playwright/test";
import {
	ADMIN_STORAGE_STATE,
	BASE_URL,
	openAdminPage,
	uniqueKey,
} from "../helpers/document-engine";

const SNAKE_CASE_ERROR_PATTERN = /snake_case/i;

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Document Engine - System Variables", () => {
	test.beforeAll(async ({ browser }) => {
		const { context } = await openAdminPage(browser);
		await context.close();
	});

	test("variables page renders with heading and add button", async ({
		page,
	}) => {
		await page.goto(`${BASE_URL}/variables`);

		await expect(
			page.getByRole("heading", { name: "System Variables" })
		).toBeVisible({ timeout: 10_000 });
		await expect(
			page.getByRole("button", { name: "Add Variable" })
		).toBeVisible();
	});

	test("create dialog has all expected form elements", async ({ page }) => {
		await page.goto(`${BASE_URL}/variables`);

		await page.getByRole("button", { name: "Add Variable" }).click();

		await expect(
			page.getByRole("heading", { name: "Create System Variable" })
		).toBeVisible();
		await expect(page.getByLabel("Key (snake_case)")).toBeVisible();
		await expect(page.getByLabel("Label")).toBeVisible();
		await expect(page.getByText("Preview")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Create Variable" })
		).toBeVisible();
	});

	test("can create a string variable and see it in the list", async ({
		page,
	}) => {
		const key = uniqueKey("test_str");
		const label = "Test String Variable";

		await page.goto(`${BASE_URL}/variables`);
		await page.getByRole("button", { name: "Add Variable" }).click();

		await page.getByLabel("Key (snake_case)").fill(key);
		await page.getByLabel("Label").fill(label);

		await page.getByRole("button", { name: "Create Variable" }).click();

		// Verify the variable appears in the list
		await expect(page.getByText(key)).toBeVisible({ timeout: 10_000 });
		// Scope label check to the row with our unique key to avoid strict mode violations
		const row = page
			.locator(".flex.items-center.gap-4")
			.filter({ hasText: key });
		await expect(row.getByText(label)).toBeVisible();
		await expect(
			row.locator("[data-slot='badge']", { hasText: "string" })
		).toBeVisible();

		// Cleanup: find and click delete for this variable
		await row
			.getByRole("button")
			.filter({ has: page.locator("svg") })
			.click();

		await expect(page.getByText(key)).not.toBeVisible({ timeout: 10_000 });
	});

	test("can create a currency variable with correct formatting", async ({
		page,
	}) => {
		const key = uniqueKey("test_amt");
		const label = "Test Amount";

		await page.goto(`${BASE_URL}/variables`);
		await page.getByRole("button", { name: "Add Variable" }).click();

		await page.getByLabel("Key (snake_case)").fill(key);
		await page.getByLabel("Label").fill(label);

		// Select currency type
		await page.locator("#var-type").click();
		await page.getByRole("option", { name: "Currency" }).click();

		// Preview should show formatted currency
		await expect(page.getByText("$250,000.00")).toBeVisible();

		await page.getByRole("button", { name: "Create Variable" }).click();

		// Verify appears in list with currency badge
		await expect(page.getByText(key)).toBeVisible({ timeout: 10_000 });
		const currencyRow = page
			.locator(".flex.items-center.gap-4")
			.filter({ hasText: key });
		await expect(
			currencyRow.locator("[data-slot='badge']", { hasText: "currency" })
		).toBeVisible();

		// Cleanup
		await currencyRow
			.getByRole("button")
			.filter({ has: page.locator("svg") })
			.click();
		await expect(page.getByText(key)).not.toBeVisible({ timeout: 10_000 });
	});

	test("create button is disabled without required fields", async ({
		page,
	}) => {
		await page.goto(`${BASE_URL}/variables`);
		await page.getByRole("button", { name: "Add Variable" }).click();

		const createButton = page.getByRole("button", {
			name: "Create Variable",
		});

		// Initially disabled (no key or label)
		await expect(createButton).toBeDisabled();

		// Fill only key — still disabled
		await page.getByLabel("Key (snake_case)").fill("test_key");
		await expect(createButton).toBeDisabled();

		// Fill label too — now enabled
		await page.getByLabel("Label").fill("Test Label");
		await expect(createButton).toBeEnabled();
	});

	test("shows error for invalid key format", async ({ page }) => {
		await page.goto(`${BASE_URL}/variables`);
		await page.getByRole("button", { name: "Add Variable" }).click();

		// Use camelCase (invalid — backend enforces snake_case)
		await page.getByLabel("Key (snake_case)").fill("invalidCamelCase");
		await page.getByLabel("Label").fill("Test");
		await page.getByRole("button", { name: "Create Variable" }).click();

		// Should show error message
		await expect(page.getByText(SNAKE_CASE_ERROR_PATTERN)).toBeVisible({
			timeout: 10_000,
		});
	});
});
