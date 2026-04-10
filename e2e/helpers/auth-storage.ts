import type { Page } from "@playwright/test";
import { loginViaWorkOS } from "./workos-login";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
}

const testAccountEmail = requireEnv("TEST_ACCOUNT_EMAIL");
const testAccountPassword = requireEnv("TEST_ACCOUNT_PW");

export const TEST_ADMIN_ORG_ID = requireEnv("TEST_ADMIN_ORG");
export const TEST_MEMBER_ORG_ID = requireEnv("TEST_MEMBER_ORG");

export async function createAuthStorageState(args: {
	orgId?: string;
	page: Page;
	path: string;
}) {
	await loginViaWorkOS(args.page, testAccountEmail, testAccountPassword);

	if (args.orgId) {
		await args.page.goto(`/e2e/switch-org?orgId=${args.orgId}`);
		await args.page.waitForURL("**/", { timeout: 15_000 });
	}

	await args.page.context().storageState({ path: args.path });
}
