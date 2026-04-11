import { expect, test } from "@playwright/test";
import { expectResolvedRole } from "./helpers";

const ORGS_TAB_PATTERN = /organizations/i;
const memberOrgId = process.env.TEST_MEMBER_ORG as string;

test("member session shows member org context", async ({ page }) => {
	await page.goto("/demo/workos");

	// Navigate to Organizations & Roles tab
	await page.getByRole("tab", { name: ORGS_TAB_PATTERN }).click();

	// Session Context card should display the member org ID
	const sessionCard = page.locator("text=Session Context").locator("..");
	await expect(sessionCard).toBeVisible({ timeout: 15_000 });

	// Verify the member org ID is displayed
	await expect(page.getByText(memberOrgId)).toBeVisible({
		timeout: 10_000,
	});
});

test("member session shows member role", async ({ page }) => {
	await page.goto("/demo/workos");
	await page.getByRole("tab", { name: ORGS_TAB_PATTERN }).click();

	// The role badge should show the resolved member role.
	await expectResolvedRole(page, "member");
});
