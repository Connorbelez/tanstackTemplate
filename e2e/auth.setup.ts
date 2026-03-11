import { test as setup } from "@playwright/test";
import { loginViaWorkOS } from "./helpers/workos-login";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}

const email = requireEnv("TEST_ACCOUNT_EMAIL");
const password = requireEnv("TEST_ACCOUNT_PW");
const adminOrgId = requireEnv("TEST_ADMIN_ORG");
const memberOrgId = requireEnv("TEST_MEMBER_ORG");

setup("authenticate as user", async ({ page }) => {
	await loginViaWorkOS(page, email, password);
	await page.context().storageState({ path: ".auth/user.json" });
});

setup("authenticate as admin", async ({ page }) => {
	await loginViaWorkOS(page, email, password);
	await page.goto(`/e2e/switch-org?orgId=${adminOrgId}`);
	await page.waitForURL("**/", { timeout: 15_000 });
	await page.context().storageState({ path: ".auth/admin.json" });
});

setup("authenticate as member", async ({ page }) => {
	await loginViaWorkOS(page, email, password);
	await page.goto(`/e2e/switch-org?orgId=${memberOrgId}`);
	await page.waitForURL("**/", { timeout: 15_000 });
	await page.context().storageState({ path: ".auth/member.json" });
});
