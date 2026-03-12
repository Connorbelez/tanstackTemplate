import { expect, test } from "@playwright/test";

const testEmail = process.env.TEST_ACCOUNT_EMAIL;
if (!testEmail) {
	throw new Error("TEST_ACCOUNT_EMAIL environment variable is required for e2e tests");
}
const SIGN_OUT_PATTERN = /sign out/i;
const SIGN_IN_PATTERN = /sign in with authkit/i;

test("authenticated user sees profile on workos demo page", async ({
	page,
}) => {
	await page.goto("/demo/workos");

	// The profile tab should show the user's email
	await expect(page.getByText(testEmail)).toBeVisible({
		timeout: 15_000,
	});
});

test("sign out clears session", async ({ page }) => {
	await page.goto("/demo/workos");

	// Wait for profile to load
	await expect(page.getByText(testEmail)).toBeVisible({
		timeout: 15_000,
	});

	// Click sign out
	await page.getByRole("button", { name: SIGN_OUT_PATTERN }).click();

	// After sign-out, the unauthenticated view should appear
	await expect(page.getByRole("link", { name: SIGN_IN_PATTERN })).toBeVisible({
		timeout: 15_000,
	});
});
