import { expect, test } from "@playwright/test";

const pageTitlePattern = /WorkOS AuthKit/i;

test("about route renders without auth", async ({ page }) => {
	await page.goto("/about");

	await expect(page).toHaveTitle(pageTitlePattern);
	await expect(
		page.getByRole("heading", { name: "A small starter with room to grow." })
	).toBeVisible();
	await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
});
