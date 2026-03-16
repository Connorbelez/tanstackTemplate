import { expect, test, type Browser, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const adminStorageState = ".auth/admin.json";
const memberStorageState = ".auth/member.json";

async function openOnboardingPage(browser: Browser, storageState: string) {
	const context = await browser.newContext({ storageState });
	const page = await context.newPage();
	await page.goto("/demo/rbac-auth/onboarding");
	await expect(page.getByText("Onboarding State Machine")).toBeVisible({
		timeout: 15_000,
	});
	return { context, page };
}

async function clearPendingRequests(browser: Browser) {
	const { context, page } = await openOnboardingPage(browser, adminStorageState);
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
	const { context, page } = await openOnboardingPage(browser, memberStorageState);

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
	const memberSession = await openOnboardingPage(browser, memberStorageState);
	await submitRoleRequest(memberSession.page, "Lawyer");
	await expect(
		memberSession.page.getByText(
			"You already have a pending request. An admin will review it shortly."
		)
	).toBeVisible({ timeout: 15_000 });
	await memberSession.context.close();

	const adminSession = await openOnboardingPage(browser, adminStorageState);
	const pendingCard = adminSession.page.locator('[data-testid^="pending-request-"]').first();
	await expect(pendingCard).toContainText("member@test.fairlend.ca");
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
	const memberSession = await openOnboardingPage(browser, memberStorageState);
	await submitRoleRequest(memberSession.page, "Lender");
	await expect(
		memberSession.page.getByText(
			"You already have a pending request. An admin will review it shortly."
		)
	).toBeVisible({ timeout: 15_000 });
	await memberSession.context.close();

	const adminSession = await openOnboardingPage(browser, adminStorageState);
	const pendingCard = adminSession.page.locator('[data-testid^="pending-request-"]').first();
	await expect(pendingCard).toContainText("member@test.fairlend.ca");
	await pendingCard.getByRole("button", { name: /^Approve / }).click();

	await expect(pendingCard).toBeHidden({ timeout: 15_000 });
	await expect(adminSession.page.getByRole("alert")).toHaveCount(0);
	await adminSession.context.close();
});

test("non-review users do not see admin review behavior", async ({ browser }) => {
	const { context, page } = await openOnboardingPage(browser, memberStorageState);

	await expect(page.getByText("Request a Role")).toBeVisible();
	await expect(page.getByText("Pending Requests (Admin)")).toHaveCount(0);
	await expect(page.getByRole("button", { name: /^Approve / })).toHaveCount(0);
	await expect(page.getByRole("button", { name: /^Reject / })).toHaveCount(0);

	await context.close();
});

test("admin mutation failures surface visible feedback in the UI", async ({
	browser,
}) => {
	const memberSession = await openOnboardingPage(browser, memberStorageState);
	await submitRoleRequest(memberSession.page, "Lawyer");
	await expect(
		memberSession.page.getByText(
			"You already have a pending request. An admin will review it shortly."
		)
	).toBeVisible({ timeout: 15_000 });
	await memberSession.context.close();

	const adminSession = await openOnboardingPage(browser, adminStorageState);
	const pendingCard = adminSession.page.locator('[data-testid^="pending-request-"]').first();
	await expect(pendingCard).toContainText("member@test.fairlend.ca");

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
