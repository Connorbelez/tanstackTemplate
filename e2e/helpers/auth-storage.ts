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

		const expectedRole =
			args.orgId === TEST_MEMBER_ORG_ID ? "member" : "admin";

		// Force the auth client to settle on the switched organization before
		// persisting the browser state. Use a dedicated e2e route so setup does
		// not depend on demo page tabs or layout structure.
		await args.page.goto("/e2e/session");
		await args.page.waitForFunction(
			([expectedOrgId, expectedSessionRole]) => {
				const el = document.querySelector('[data-testid="session-json"]');
				if (!el?.textContent) {
					return false;
				}

				try {
					const session = JSON.parse(el.textContent) as {
						tokenOrganizationId?: string | null;
						tokenRole?: string | null;
						error?: string;
					};
					if (session.error) {
						return true;
					}
					return (
						session.tokenOrganizationId === expectedOrgId &&
						session.tokenRole === expectedSessionRole
					);
				} catch {
					return false;
				}
			},
			[args.orgId, expectedRole],
			{ timeout: 15_000 }
		);

		const sessionJson = await args.page
			.locator('[data-testid="session-json"]')
			.textContent();
		if (!sessionJson) {
			throw new Error("E2E session bootstrap did not render session JSON");
		}

		const session = JSON.parse(sessionJson) as {
			error?: string;
			tokenOrganizationId?: string | null;
			tokenRole?: string | null;
		};
		if (session.error) {
			throw new Error(
				`E2E session bootstrap failed: ${session.error} for org ${args.orgId}`
			);
		}
	}

	await args.page.context().storageState({ path: args.path });
}
