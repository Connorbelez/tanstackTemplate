import { expect, test } from "@playwright/test";
import { expectResolvedRole } from "./helpers";

const ORGS_TAB_PATTERN = /organizations/i;
const adminOrgId = process.env.TEST_ADMIN_ORG as string;

test("admin session shows admin org context", async ({ page }) => {
	await page.goto("/demo/workos");

	// Navigate to Organizations & Roles tab
	await page.getByRole("tab", { name: ORGS_TAB_PATTERN }).click();

	// Session Context card should display the admin org ID
	const sessionCard = page.locator("text=Session Context").locator("..");
	await expect(sessionCard).toBeVisible({ timeout: 15_000 });

	// Verify the admin org ID is displayed
	await expect(page.getByText(adminOrgId)).toBeVisible({
		timeout: 10_000,
	});
});

test("admin session shows admin role", async ({ page }) => {
	await page.goto("/demo/workos");
	await page.getByRole("tab", { name: ORGS_TAB_PATTERN }).click();

	// The role badge should show the resolved admin role.
	await expectResolvedRole(page, "admin");
});
