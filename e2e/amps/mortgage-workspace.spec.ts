import { expect, test } from "@playwright/test";

const BASE = "/demo/amps";
const DATA_LOAD_TIMEOUT = 20_000;

function sectionTitle(
	page: import("@playwright/test").Page,
	title: string
) {
	return page
		.locator('[data-slot="card-title"]')
		.filter({ hasText: new RegExp(`^${title}$`, "i") })
		.first();
}

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

test.describe("AMPS Demo - mortgage workspace", () => {
	test("opens the workout-backed mortgage story and surfaces governed operator flows", async ({
		page,
	}) => {
		await prepareWorkspace(page);

		const workoutStory = page.locator('[data-scenario-key="workout_backed"]');
		await workoutStory.getByRole("link", { name: "Open workspace" }).click();

		await expect(sectionTitle(page, "Obligation truth")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
		await expect(sectionTitle(page, "Strategy context")).toBeVisible();
		await expect(sectionTitle(page, "Collection plan")).toBeVisible();
		await expect(sectionTitle(page, "Execution history")).toBeVisible();
		await expect(sectionTitle(page, "Workout lifecycle")).toBeVisible();
		await expect(page.getByText("active workout")).toBeVisible();

		await page.getByRole("button", { name: "Complete workout" }).click();
		const completionDialog = page.getByRole("dialog");
		await expect(completionDialog).toContainText("Complete workout");
		await completionDialog
			.getByRole("button", { name: "Complete workout" })
			.click();
		await expect(page.getByText("No active workout")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
		await expect(page.getByText("Historical workouts")).toBeVisible();
	});
});
