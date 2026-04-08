import { test as setup } from "@playwright/test";
import { loginViaWorkOS } from "../helpers/workos-login";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}

const email = requireEnv("TEST_ACCOUNT_EMAIL");
const password = requireEnv("TEST_ACCOUNT_PW");

setup("authenticate as amps admin", async ({ page }) => {
	await loginViaWorkOS(page, email, password);
	await page.context().storageState({ path: ".auth/amps-admin.json" });
});
