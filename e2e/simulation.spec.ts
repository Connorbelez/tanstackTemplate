import { expect, test } from "@playwright/test";

const BASE = "/demo/simulation";
const DATA_LOAD_TIMEOUT = 20_000;
const GREENFIELD_LABEL = "123 Greenfield Rd — Residential";
const FIRST_PAYMENT_DUE_DATE = "2024-02-01";
const PARTIAL_PAYMENT_CENTS = "100";

async function goToPage(page: import("@playwright/test").Page) {
	await page.goto(BASE);
	await expect(
		page.getByRole("heading", { name: "Marketplace Simulation" })
	).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
}

async function cleanupSimulation(page: import("@playwright/test").Page) {
	await goToPage(page);

	const cleanupButton = page.getByRole("button", { name: "Cleanup" });
	const isRunning = await cleanupButton
		.isVisible({ timeout: 2_000 })
		.catch(() => false);

	if (!isRunning) {
		await expect(
			page.getByRole("button", { name: "Start Simulation" })
		).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
		return;
	}

	await cleanupButton.click();
	await expect(
		page.getByRole("button", { name: "Start Simulation" })
	).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
	await expect(page.getByText(/No simulation running\./)).toBeVisible({
		timeout: DATA_LOAD_TIMEOUT,
	});
}

async function openObligationsTab(page: import("@playwright/test").Page) {
	await page.getByRole("tab", { name: /Obligations/ }).click();
	await expect(page.getByRole("columnheader", { name: "Due Date" })).toBeVisible({
		timeout: DATA_LOAD_TIMEOUT,
	});
}

function obligationRow(page: import("@playwright/test").Page) {
	return page
		.locator("tbody tr")
		.filter({ hasText: GREENFIELD_LABEL })
		.filter({ hasText: FIRST_PAYMENT_DUE_DATE })
		.first();
}

function obligationAmountCell(page: import("@playwright/test").Page) {
	return obligationRow(page).locator("td").nth(5);
}

function currencyTextToCents(value: string): number {
	const normalized = value.replace(/[$,\s]/g, "");
	const parsed = Number.parseFloat(normalized);
	if (Number.isNaN(parsed)) {
		throw new Error(`Unable to parse currency amount: ${value}`);
	}
	return Math.round(parsed * 100);
}

test.describe("Marketplace Simulation — Full Flow", () => {
	test.describe.configure({ mode: "serial" });

	test.beforeEach(async ({ page }) => {
		await cleanupSimulation(page);
	});

	test.afterEach(async ({ page }) => {
		await cleanupSimulation(page);
	});

	test("runs the simulation from seed through settlement and cleanup", async ({
		page,
	}) => {
		let remainingPaymentAmount = 0;

		await goToPage(page);

		await test.step("start the simulation and verify seeded layout", async () => {
			await page.getByRole("button", { name: "Start Simulation" }).click();

			await expect(page.getByText(/72 obligations/)).toBeVisible({
				timeout: DATA_LOAD_TIMEOUT,
			});
			await expect(page.getByText("2024-01-01").first()).toBeVisible({
				timeout: DATA_LOAD_TIMEOUT,
			});
			await expect(page.getByText(GREENFIELD_LABEL)).toBeVisible();
			await expect(
				page.getByText("456 Riverside Dr — Commercial")
			).toBeVisible();
			await expect(page.getByText("789 Oakwood Ave — Mixed Use")).toBeVisible();
			await expect(page.getByText("Planned")).toHaveCount(6);
		});

		await test.step("verify obligations begin as upcoming and not payable", async () => {
			await openObligationsTab(page);

			const greenfieldFirstPayment = obligationRow(page);
			await expect(greenfieldFirstPayment).toContainText("upcoming");
			await expect(greenfieldFirstPayment.getByRole("button", { name: "Pay" }))
				.toBeDisabled();
		});

		await test.step("advance time until the first payment is due", async () => {
			await page.getByRole("button", { name: "+30 Days" }).click();
			await expect(page.getByText(/Date: 2024-01-31/)).toBeVisible({
				timeout: DATA_LOAD_TIMEOUT,
			});

			await page.getByRole("button", { name: "+1 Day" }).click();
			await expect(page.getByText(/Date: 2024-02-01/)).toBeVisible({
				timeout: DATA_LOAD_TIMEOUT,
			});
			await expect(
				page
					.locator("tbody tr")
					.filter({ hasText: FIRST_PAYMENT_DUE_DATE })
					.getByText("due")
			).toHaveCount(3, { timeout: DATA_LOAD_TIMEOUT });

			const greenfieldFirstPayment = obligationRow(page);
			await expect(greenfieldFirstPayment).toContainText("TODAY");
			await expect(greenfieldFirstPayment).toContainText("due");
			await expect(greenfieldFirstPayment.getByRole("button", { name: "Pay" }))
				.toBeEnabled();
		});

		await test.step("apply a partial payment", async () => {
			await obligationRow(page).getByRole("button", { name: "Pay" }).click();
			const settledAmount = page.getByLabel("Settled amount (¢):");
			await expect(settledAmount).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
			await settledAmount.fill(PARTIAL_PAYMENT_CENTS);
			await page.getByRole("button", { name: "Apply Payment" }).click();

			await expect(
				page.getByText("Partial payment applied. Obligation remains open.")
			).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
			await expect(obligationRow(page)).toContainText("partially_settled");
			remainingPaymentAmount = currencyTextToCents(
				await obligationAmountCell(page).innerText()
			);
			expect(remainingPaymentAmount).toBeGreaterThan(0);
		});

		await test.step("jump past grace period and verify the obligation becomes overdue", async () => {
			await page.getByPlaceholder("YYYY-MM-DD").fill("2024-02-06");
			await page.getByRole("button", { name: "Go" }).click();

			await expect(page.getByText(/Date: 2024-02-06/)).toBeVisible({
				timeout: DATA_LOAD_TIMEOUT,
			});
			await expect(obligationRow(page)).toContainText("overdue");
		});

		await test.step("settle the overdue obligation and verify dispersal history", async () => {
			await obligationRow(page).getByRole("button", { name: "Pay" }).click();
			const settledAmount = page.getByLabel("Settled amount (¢):");
			await expect(settledAmount).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
			await settledAmount.fill(String(remainingPaymentAmount));
			await page.getByRole("button", { name: "Apply Payment" }).click();
			const successMessage = page.getByText(
				"Payment applied. Dispersal scheduled."
			);
			const settledOnFirstTry = await successMessage
				.isVisible({ timeout: 3_000 })
				.catch(() => false);
			if (!settledOnFirstTry) {
				const overpayError = page.getByText(/remaining balance \d+/);
				await expect(overpayError).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
				const match = (await overpayError.innerText()).match(
					/remaining balance (\d+)/
				);
				if (!match) {
					throw new Error("Could not parse remaining balance from payment error");
				}
				await obligationRow(page).getByRole("button", { name: "Pay" }).click();
				const retryAmountInput = page.getByLabel("Settled amount (¢):");
				await expect(retryAmountInput).toBeVisible({
					timeout: DATA_LOAD_TIMEOUT,
				});
				await retryAmountInput.fill(match[1]);
				await page.getByRole("button", { name: "Apply Payment" }).click();
			}
			await expect(successMessage).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
			await expect(obligationRow(page)).toHaveCount(0, {
				timeout: DATA_LOAD_TIMEOUT,
			});

			await page.getByRole("tab", { name: /Dispersals/ }).click();
			await expect(
				page.getByText("No dispersals yet. Settle obligations from the Obligations tab.")
			).toHaveCount(0, { timeout: DATA_LOAD_TIMEOUT });
			await expect(page.locator("tbody tr")).toHaveCount(3, {
				timeout: DATA_LOAD_TIMEOUT,
			});
		});

		await test.step("verify the trial balance tab still renders simulation accounts", async () => {
			await page.getByRole("tab", { name: "Trial Balance" }).click();
			await expect(page.getByText("All Simulation Accounts")).toBeVisible({
				timeout: DATA_LOAD_TIMEOUT,
			});
			await expect(page.getByText("WORLD")).toBeVisible();
			await expect(page.getByText("TREASURY").first()).toBeVisible();
			await expect(page.getByText("POSITION").first()).toBeVisible();
		});

		await test.step("clean up the simulation", async () => {
			await page.getByRole("button", { name: "Cleanup" }).click();
			await expect(
				page.getByRole("button", { name: "Start Simulation" })
			).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
			await expect(page.getByText(/No simulation running\./)).toBeVisible({
				timeout: DATA_LOAD_TIMEOUT,
			});
		});
	});
});
