import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
	expect,
	test,
	type Browser,
	type BrowserContext,
	type Page,
} from "@playwright/test";
import {
	createAuthStorageState,
	TEST_ADMIN_ORG_ID,
	TEST_MEMBER_ORG_ID,
} from "../helpers/auth-storage";

test.describe.configure({ mode: "serial" });

const testAccountEmail = process.env.TEST_ACCOUNT_EMAIL;
if (!testAccountEmail) {
	throw new Error("TEST_ACCOUNT_EMAIL environment variable is required for e2e tests");
}

const onboardingAuthStateDir = join(process.cwd(), ".tmp", "auth", "onboarding");

function getBaseURL(): string {
	const baseURL = test.info().project.use.baseURL;
	if (!baseURL) {
		throw new Error("Playwright baseURL is required for onboarding auth setup");
	}
	return baseURL;
}

async function createFreshStorageState(browser: Browser, orgId: string) {
	await mkdir(onboardingAuthStateDir, { recursive: true });

	const bootstrapContext = await browser.newContext({ baseURL: getBaseURL() });
	const bootstrapPage = await bootstrapContext.newPage();
	const storageStatePath = join(
		onboardingAuthStateDir,
		`storage-${orgId}-${randomUUID()}.json`
	);

	try {
		await createAuthStorageState({
			orgId,
			page: bootstrapPage,
			path: storageStatePath,
		});

		return storageStatePath;
	} catch (error) {
		await rm(storageStatePath, { force: true });
		throw error;
	} finally {
		await bootstrapContext.close();
	}
}

async function openOnboardingPage(browser: Browser, orgId: string) {
	const storageState = await createFreshStorageState(browser, orgId);
	let context: BrowserContext | undefined;
	try {
		context = await browser.newContext({
			baseURL: getBaseURL(),
			storageState,
		});
		const page = await context.newPage();
		await page.goto("/demo/rbac-auth/onboarding");
		await expect(page.getByText("Onboarding State Machine")).toBeVisible({
			timeout: 15_000,
		});
		await rm(storageState, { force: true });
		return { context, page };
	} catch (error) {
		await context?.close();
		await rm(storageState, { force: true });
		throw error;
	}
}

async function clearPendingRequests(browser: Browser) {
	const { context, page } = await openOnboardingPage(browser, TEST_ADMIN_ORG_ID);
	const pendingCards = page.locator('[data-testid^="pending-request-"]');
	while ((await pendingCards.count()) > 0) {
		const card = pendingCards.first();
		await card.getByRole("button", { name: /^Reject / }).click();
		await page.getByLabel("Rejection reason").fill(`E2E cleanup ${Date.now()}`);
		await page.getByRole("button", { name: /^Confirm rejection for / }).click();
		await expect(card).toBeHidden({ timeout: 15_000 });
	}
	await context.close();
}

async function submitRoleRequest(page: Page, roleLabel: string) {
	await page.getByRole("button", { name: `Select ${roleLabel} role` }).click();
	await page.getByRole("button", { name: "Submit Request" }).click();
}

test.beforeEach(async ({ browser }) => {
	await clearPendingRequests(browser);
});

test("member submits a valid role request and sees the pending state", async ({
	browser,
}) => {
	const { context, page } = await openOnboardingPage(browser, TEST_MEMBER_ORG_ID);

	await expect(page.getByText("Request a Role")).toBeVisible();
	await expect(page.getByText("Pending Requests (Admin)")).toHaveCount(0);
	await submitRoleRequest(page, "Lawyer");

	await expect(
		page.getByText("You already have a pending request. An admin will review it shortly.")
	).toBeVisible({ timeout: 15_000 });

	await context.close();
});

test("admin sees a pending request and can reject it with a visible UI update", async ({
	browser,
}) => {
	const memberSession = await openOnboardingPage(browser, TEST_MEMBER_ORG_ID);
	await submitRoleRequest(memberSession.page, "Lawyer");
	await expect(
		memberSession.page.getByText(
			"You already have a pending request. An admin will review it shortly."
		)
	).toBeVisible({ timeout: 15_000 });
	await memberSession.context.close();

	const adminSession = await openOnboardingPage(browser, TEST_ADMIN_ORG_ID);
	const pendingCard = adminSession.page.locator('[data-testid^="pending-request-"]').first();
	await expect(pendingCard).toContainText(testAccountEmail);
	await pendingCard.getByRole("button", { name: /^Reject / }).click();
	await adminSession.page.getByLabel("Rejection reason").fill("Rejected from E2E");
	await adminSession.page
		.getByRole("button", { name: /^Confirm rejection for / })
		.click();

	await expect(pendingCard).toBeHidden({ timeout: 15_000 });
	await expect(adminSession.page.getByRole("alert")).toHaveCount(0);
	await adminSession.context.close();
});

test("admin can approve a pending request without surfacing an unhandled error", async ({
	browser,
}) => {
	const memberSession = await openOnboardingPage(browser, TEST_MEMBER_ORG_ID);
	await submitRoleRequest(memberSession.page, "Lender");
	await expect(
		memberSession.page.getByText(
			"You already have a pending request. An admin will review it shortly."
		)
	).toBeVisible({ timeout: 15_000 });
	await memberSession.context.close();

	const adminSession = await openOnboardingPage(browser, TEST_ADMIN_ORG_ID);
	const pendingCard = adminSession.page.locator('[data-testid^="pending-request-"]').first();
	await expect(pendingCard).toContainText(testAccountEmail);
	await pendingCard.getByRole("button", { name: /^Approve / }).click();

	await expect(pendingCard).toBeHidden({ timeout: 15_000 });
	await expect(adminSession.page.getByRole("alert")).toHaveCount(0);
	await adminSession.context.close();
});

test("non-review users do not see admin review behavior", async ({ browser }) => {
	const { context, page } = await openOnboardingPage(browser, TEST_MEMBER_ORG_ID);

	await expect(page.getByText("Request a Role")).toBeVisible();
	await expect(page.getByText("Pending Requests (Admin)")).toHaveCount(0);
	await expect(page.getByRole("button", { name: /^Approve / })).toHaveCount(0);
	await expect(page.getByRole("button", { name: /^Reject / })).toHaveCount(0);

	await context.close();
});

test("admin mutation failures surface visible feedback in the UI", async ({
	browser,
}) => {
	const memberSession = await openOnboardingPage(browser, TEST_MEMBER_ORG_ID);
	await submitRoleRequest(memberSession.page, "Lawyer");
	await expect(
		memberSession.page.getByText(
			"You already have a pending request. An admin will review it shortly."
		)
	).toBeVisible({ timeout: 15_000 });
	await memberSession.context.close();

	const adminSession = await openOnboardingPage(browser, TEST_ADMIN_ORG_ID);
	const pendingCard = adminSession.page.locator('[data-testid^="pending-request-"]').first();
	await expect(pendingCard).toContainText(testAccountEmail);

	await adminSession.context.setOffline(true);
	await pendingCard.getByRole("button", { name: /^Approve / }).click();
	await expect(adminSession.page.getByRole("alert")).toBeVisible({
		timeout: 15_000,
	});

	await adminSession.context.setOffline(false);
	await adminSession.page.reload();
	const refreshedCard = adminSession.page.locator('[data-testid^="pending-request-"]').first();
	await refreshedCard.getByRole("button", { name: /^Reject / }).click();
	await adminSession.page.getByLabel("Rejection reason").fill("Cleanup after offline failure");
	await adminSession.page
		.getByRole("button", { name: /^Confirm rejection for / })
		.click();
	await expect(refreshedCard).toBeHidden({ timeout: 15_000 });
	await adminSession.context.close();
});
