import { expect, test } from "@playwright/test";
import {
	ADMIN_STORAGE_STATE,
	openAdminPage,
} from "../helpers/document-engine";

const BASE = "/demo/document-engine";

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("Document Engine - Navigation & Layout", () => {
	test.beforeAll(async ({ browser }) => {
		const { context } = await openAdminPage(browser);
		await context.close();
	});

	test("layout renders with page title and navigation", async ({ page }) => {
		await page.goto(BASE);

		await expect(
			page.getByRole("heading", { name: "Document Engine" })
		).toBeVisible({ timeout: 10_000 });

		// All nav items visible
		const nav = page.locator("nav");
		await expect(nav.getByText("Dashboard")).toBeVisible();
		await expect(nav.getByText("Library")).toBeVisible();
		await expect(nav.getByText("Variables")).toBeVisible();
		await expect(nav.getByText("Templates")).toBeVisible();
		await expect(nav.getByText("Groups")).toBeVisible();
		await expect(nav.getByText("Generate")).toBeVisible();
	});

	test("dashboard shows stat cards and getting started guide", async ({
		page,
	}) => {
		await page.goto(BASE);

		// Stat card labels — scoped to cards to avoid matching nav items
		const cards = page.locator("[data-slot='card']");
		await expect(cards.getByText("Base PDFs")).toBeVisible({ timeout: 10_000 });
		await expect(cards.getByText("Variables").first()).toBeVisible();
		await expect(cards.getByText("Templates").first()).toBeVisible();
		await expect(cards.getByText("Groups").first()).toBeVisible();

		// Getting started section
		await expect(
			page.locator("[data-slot='card-title']", { hasText: "Getting Started" })
		).toBeVisible();
		await expect(page.getByText("Upload a Base PDF")).toBeVisible();
		await expect(page.getByText("Define System Variables")).toBeVisible();
	});

	test("can navigate to library page", async ({ page }) => {
		await page.goto(BASE);
		await page.locator("nav").getByText("Library").click();
		await expect(
			page.getByRole("heading", { name: "Base PDF Library" })
		).toBeVisible({ timeout: 10_000 });
	});

	test("can navigate to variables page", async ({ page }) => {
		await page.goto(BASE);
		await page.locator("nav").getByText("Variables").click();
		await expect(
			page.getByRole("heading", { name: "System Variables" })
		).toBeVisible({ timeout: 10_000 });
	});

	test("can navigate to templates page", async ({ page }) => {
		await page.goto(BASE);
		await page.locator("nav").getByText("Templates").click();
		await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible({
			timeout: 10_000,
		});
	});

	test("can navigate to groups page", async ({ page }) => {
		await page.goto(BASE);
		await page.locator("nav").getByText("Groups").click();
		await expect(
			page.getByRole("heading", { name: "Template Groups" })
		).toBeVisible({ timeout: 10_000 });
	});

	test("can navigate to generate page", async ({ page }) => {
		await page.goto(BASE);
		await page.locator("nav").getByText("Generate").click();
		await expect(
			page.getByRole("heading", { name: "Generate Documents" })
		).toBeVisible({ timeout: 10_000 });
	});
});
