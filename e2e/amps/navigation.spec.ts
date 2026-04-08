import { expect, test } from "@playwright/test";

const BASE = "/demo/amps";
const DATA_LOAD_TIMEOUT = 20_000;

async function prepareWorkspace(page: import("@playwright/test").Page) {
	await page.goto(BASE);
	await expect(
		page.getByRole("heading", { name: "Active Mortgage Payment System" }),
	).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
	await page
		.getByRole("button", { name: "Prepare deterministic scenarios" })
		.click();
	const workoutStory = page.locator('[data-scenario-key="workout_backed"]');
	await expect(
		workoutStory.getByText("Scenario ready"),
	).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
	await expect(
		workoutStory.getByRole("link", { name: "Open workspace" }),
	).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
}

test.describe("AMPS Demo - navigation", () => {
	test("loads the command deck and the dedicated rule, plan, and attempt surfaces", async ({
		page,
	}) => {
		await prepareWorkspace(page);

		await expect(page.getByText("Scenario command deck")).toBeVisible();
		await expect(page.getByText("Mortgage anchors")).toBeVisible();

		await page.goto("/demo/amps/rules");
		await expect(page.getByText("Rule operations surface")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
		await expect(page.getByText("Selected rule detail")).toBeVisible();

		await page.goto("/demo/amps/collection-plan");
		await expect(page.getByText("Collection strategy queue")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
		await expect(page.getByText("Strategy detail rail")).toBeVisible();

		await page.goto("/demo/amps/collection-attempts");
		await expect(page.getByText("Execution history surface")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
		await expect(page.getByText("Execution detail rail")).toBeVisible();
	});
});
