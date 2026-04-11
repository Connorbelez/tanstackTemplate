import { expect, type Page } from "@playwright/test";

export async function expectResolvedRole(page: Page, role: string) {
	const roleLabel = page.getByText("Role", { exact: true });
	await expect(roleLabel).toBeVisible({ timeout: 10_000 });
	await expect(roleLabel.locator("xpath=following-sibling::*[1]")).toHaveText(
		role,
		{ timeout: 10_000 }
	);
}
