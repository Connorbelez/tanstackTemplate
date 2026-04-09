import { expect, test } from "@playwright/test";

const BASE_PATH = "/demo/amps/e2e-payments";
const LOAD_TIMEOUT = 20_000;

function stageBadge(page: import("@playwright/test").Page) {
	return page.getByTestId("e2e-stage-badge");
}

function statusCell(
	page: import("@playwright/test").Page,
	testId:
		| "e2e-plan-entry-status"
		| "e2e-attempt-status"
		| "e2e-inbound-transfer-status"
		| "e2e-obligation-status"
		| "e2e-dispersal-status"
		| "e2e-outbound-transfer-status"
) {
	return page.getByTestId(testId);
}

async function openHarness(
	page: import("@playwright/test").Page,
	runId: string
) {
	await page.goto(`${BASE_PATH}?runId=${runId}`);
	await expect(
		page.getByRole("heading", { name: "Offline Collection Lifecycle Harness" })
	).toBeVisible({ timeout: LOAD_TIMEOUT });
}

test.describe("AMPS offline payments e2e harness", () => {
	test("runs the full offline collection lifecycle", async ({ page }) => {
		const runId = `pw-happy-${Date.now()}`;
		await openHarness(page, runId);

		await page.getByTestId("e2e-seed-button").click();
		await expect(stageBadge(page)).toContainText("seeded", {
			timeout: LOAD_TIMEOUT,
		});

		await page.getByTestId("e2e-execute-plan-entry-button").click();
		await expect(stageBadge(page)).toContainText("inbound_pending_confirmation", {
			timeout: LOAD_TIMEOUT,
		});
		await expect(statusCell(page, "e2e-plan-entry-status")).toContainText(
			"executing"
		);
		await expect(statusCell(page, "e2e-attempt-status")).toContainText(
			"pending"
		);
		await expect(statusCell(page, "e2e-inbound-transfer-status")).toContainText(
			"pending"
		);

		await page.getByTestId("e2e-confirm-inbound-button").click();
		await expect(statusCell(page, "e2e-obligation-status")).toContainText(
			"settled",
			{ timeout: LOAD_TIMEOUT }
		);
		await expect(statusCell(page, "e2e-dispersal-status")).toContainText(
			"pending",
			{ timeout: LOAD_TIMEOUT }
		);

		await page.getByTestId("e2e-trigger-payout-button").click();
		await expect(stageBadge(page)).toContainText("outbound_pending_confirmation", {
			timeout: LOAD_TIMEOUT,
		});
		await expect(statusCell(page, "e2e-outbound-transfer-status")).toContainText(
			"pending"
		);

		await page.getByTestId("e2e-confirm-outbound-button").click();
		await expect(stageBadge(page)).toContainText("outbound_confirmed", {
			timeout: LOAD_TIMEOUT,
		});
		await expect(statusCell(page, "e2e-outbound-transfer-status")).toContainText(
			"confirmed"
		);
		await expect(statusCell(page, "e2e-dispersal-status")).toContainText(
			"disbursed"
		);

		await page.getByTestId("e2e-cleanup-button").click();
		await expect(stageBadge(page)).toContainText("not_seeded", {
			timeout: LOAD_TIMEOUT,
		});
	});

	test("replays seed and cleanup safely for the same run", async ({ page }) => {
		const runId = `pw-replay-${Date.now()}`;
		await openHarness(page, runId);

		await page.getByTestId("e2e-seed-button").click();
		await expect(stageBadge(page)).toContainText("seeded", {
			timeout: LOAD_TIMEOUT,
		});

		await page.getByTestId("e2e-seed-button").click();
		await expect(stageBadge(page)).toContainText("seeded", {
			timeout: LOAD_TIMEOUT,
		});
		await expect(statusCell(page, "e2e-plan-entry-status")).toContainText(
			"planned"
		);

		await page.getByTestId("e2e-cleanup-button").click();
		await expect(stageBadge(page)).toContainText("not_seeded", {
			timeout: LOAD_TIMEOUT,
		});

		await page.getByTestId("e2e-cleanup-button").click();
		await expect(stageBadge(page)).toContainText("not_seeded", {
			timeout: LOAD_TIMEOUT,
		});
	});
});
