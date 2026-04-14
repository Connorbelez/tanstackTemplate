import { expect, test } from "@playwright/test";
import {
	ADMIN_STORAGE_STATE,
	BASE_URL,
	openAdminPage,
	uniqueName,
} from "../helpers/document-engine";

const SIGNATORY_COUNT_PATTERN = /0 signator/;

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Document Engine - Template Groups", () => {
	test.beforeAll(async ({ browser }) => {
		const { context } = await openAdminPage(browser);
		await context.close();
	});

	test("groups page renders with heading and create button", async ({
		page,
	}) => {
		await page.goto(`${BASE_URL}/groups`);

		await expect(
			page.getByRole("heading", { name: "Template Groups" })
		).toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole("button", { name: "New Group" })).toBeVisible();
	});

	test("create dialog has name and description fields", async ({ page }) => {
		await page.goto(`${BASE_URL}/groups`);

		await page.getByRole("button", { name: "New Group" }).click();

		await expect(
			page.getByRole("heading", { name: "Create Template Group" })
		).toBeVisible();
		await expect(page.getByLabel("Name")).toBeVisible();
		await expect(page.getByLabel("Description (optional)")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Create Group" })
		).toBeVisible();
	});

	test("can create a group and see it in the list", async ({ page }) => {
		const groupName = uniqueName("TestGroup");
		await page.goto(`${BASE_URL}/groups`);

		await page.getByRole("button", { name: "New Group" }).click();
		await page.getByLabel("Name").fill(groupName);
		await page.getByRole("button", { name: "Create Group" }).click();

		// Group should appear with metadata — scope to the card with our unique name
		await expect(page.getByText(groupName)).toBeVisible({ timeout: 10_000 });
		const groupCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: groupName });
		await expect(groupCard.getByText("0 templates")).toBeVisible();
		await expect(groupCard.getByText(SIGNATORY_COUNT_PATTERN)).toBeVisible();

		// Cleanup
		const card = page
			.locator("[data-slot='card']")
			.filter({ hasText: groupName })
			.first();
		await card
			.getByRole("button")
			.filter({ has: page.locator("svg") })
			.click();
		await expect(page.getByText(groupName)).not.toBeVisible({
			timeout: 10_000,
		});
	});

	test("can expand a group to see its details", async ({ page }) => {
		const groupName = uniqueName("ExpandGroup");
		await page.goto(`${BASE_URL}/groups`);

		// Create group
		await page.getByRole("button", { name: "New Group" }).click();
		await page.getByLabel("Name").fill(groupName);
		await page.getByRole("button", { name: "Create Group" }).click();
		await page.getByText(groupName).waitFor({ timeout: 10_000 });

		// Click to expand — scope to the card with our unique name
		const expandCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: groupName });
		await expandCard.getByText(groupName).click();

		// Expanded view shows template section
		await expect(expandCard.getByText("No templates added yet")).toBeVisible({
			timeout: 5000,
		});

		// Should have add template selector
		await expect(expandCard.getByText("Add template...")).toBeVisible();

		// Cleanup
		const cleanupCard = page
			.locator("[data-slot='card']")
			.filter({ hasText: groupName })
			.first();
		await cleanupCard
			.getByRole("button")
			.filter({ has: page.locator("svg") })
			.first()
			.click();
	});

	test("create group button is disabled without name", async ({ page }) => {
		await page.goto(`${BASE_URL}/groups`);

		await page.getByRole("button", { name: "New Group" }).click();

		const createButton = page.getByRole("button", { name: "Create Group" });
		await expect(createButton).toBeDisabled();

		await page.getByLabel("Name").fill("Test");
		await expect(createButton).toBeEnabled();
	});
});
