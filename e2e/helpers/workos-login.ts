import type { Page } from "@playwright/test";

/**
 * Automates the WorkOS AuthKit hosted login page.
 *
 * Flow: /sign-in → WorkOS email → password → org picker → callback → app
 *
 * Selectors derived from manual browser testing of the WorkOS AuthKit UI.
 */
export async function loginViaWorkOS(
	page: Page,
	email: string,
	password: string
) {
	// Navigate to /sign-in which triggers a server-side redirect to WorkOS
	await page.goto("/sign-in");

	// ── Step 1: Email ──
	const emailInput = page.getByRole("textbox", { name: "Email" });
	await emailInput.waitFor({ state: "visible", timeout: 30_000 });
	await emailInput.fill(email);
	await page.getByRole("button").filter({ hasText: "Continue" }).click();

	// ── Step 2: Password ──
	const passwordInput = page.getByRole("textbox", { name: "Password" });
	await passwordInput.waitFor({ state: "visible", timeout: 15_000 });
	await passwordInput.fill(password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();

	// ── Step 3: Org picker (multi-org users only) ──
	const orgHeading = page.getByRole("heading", {
		name: "Select an organization to continue",
	});
	const hasOrgPicker = await orgHeading
		.waitFor({ state: "visible", timeout: 5000 })
		.then(() => true)
		.catch(() => false);
	if (hasOrgPicker) {
		const orgPicker = orgHeading.locator("xpath=ancestor::*[.//button][1]");
		const preferredOrgButton = orgPicker.getByRole("button", {
			name: "FairLendStaff",
			exact: true,
		});
		const fallbackOrgButton = orgPicker.getByRole("button").first();
		const targetOrgButton = await preferredOrgButton
			.waitFor({ state: "visible", timeout: 2000 })
			.then(() => preferredOrgButton)
			.catch(() => fallbackOrgButton);
		await targetOrgButton.waitFor({ state: "visible", timeout: 2000 });
		await targetOrgButton.click();
	}

	// ── Step 3b: Optional passkey prompt ──
	const skipPasskeyButton = page.getByRole("button", {
		name: "Skip for now",
	});
	const hasPasskeyPrompt = await skipPasskeyButton
		.waitFor({ state: "visible", timeout: 5000 })
		.then(() => true)
		.catch(() => false);
	if (hasPasskeyPrompt) {
		await skipPasskeyButton.click();
	}

	// ── Step 4: Wait for redirect back to app ──
	await page.waitForURL(
		(url) =>
			!(url.hostname.includes("authkit") || url.pathname.includes("/callback")),
		{ timeout: 30_000 }
	);
}
