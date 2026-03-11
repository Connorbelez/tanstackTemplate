import { expect, test } from "@playwright/test";

const WORKOS_URL_PATTERN = /authkit\.workos\.com|workos\.com/i;

test("public route /about works without auth", async ({ page }) => {
	await page.goto("/about");

	await expect(
		page.getByRole("heading", { name: "A small starter with room to grow." })
	).toBeVisible();
});

test("/sign-in redirects to WorkOS hosted page", async ({ page }) => {
	await page.goto("/sign-in");

	// Should redirect to the WorkOS-hosted authentication page
	await page.waitForURL(WORKOS_URL_PATTERN, {
		timeout: 30_000,
	});

	// The email input should be visible on the WorkOS login page
	await expect(page.locator('input[type="email"]')).toBeVisible();
});
