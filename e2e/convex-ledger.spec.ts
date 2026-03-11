import { expect, test } from "@playwright/test";

// ── Helpers ──────────────────────────────────────────────────────
const BASE = "/demo/convex-ledger";
const DATA_LOAD_TIMEOUT = 15_000;

async function goToPage(page: import("@playwright/test").Page) {
	await page.goto(BASE);
	await expect(
		page.getByRole("heading", { name: "Mortgage Ownership Ledger" }),
	).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
}

async function ensureSeeded(page: import("@playwright/test").Page) {
	await goToPage(page);

	const seedBtn = page.getByRole("button", { name: "Seed Demo Data" });
	if (await seedBtn.isEnabled({ timeout: 2_000 }).catch(() => false)) {
		await seedBtn.click();
		await expect(page.getByText("123 Greenfield Rd")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
	}
}

async function ensureClean(page: import("@playwright/test").Page) {
	await goToPage(page);

	const cleanupBtn = page.getByRole("button", {
		name: "Clean Up All Demo Data",
	});
	if (await cleanupBtn.isEnabled({ timeout: 2_000 }).catch(() => false)) {
		await cleanupBtn.click();
		await expect(
			page.getByRole("button", { name: "Seed Demo Data" }),
		).toBeEnabled({ timeout: DATA_LOAD_TIMEOUT });
	}
}

// ── Layout & Rendering ──────────────────────────────────────────
test.describe("Ledger Demo — Layout", () => {
	test("renders page title and description", async ({ page }) => {
		await goToPage(page);

		await expect(
			page.getByRole("heading", { name: "Mortgage Ownership Ledger" }),
		).toBeVisible();
		await expect(page.getByText("Double-entry ownership ledger")).toBeVisible();
	});

	test("shows controls card with seed button", async ({ page }) => {
		await goToPage(page);

		await expect(page.getByText("Controls")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Seed Demo Data" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Clean Up All Demo Data" }),
		).toBeVisible();
	});

	test("shows demo- prefix help text", async ({ page }) => {
		await goToPage(page);

		await expect(page.getByText("demo-")).toBeVisible();
		await expect(page.getByText("prefixed IDs")).toBeVisible();
	});
});

// ── Seed Data Flow ──────────────────────────────────────────────
test.describe("Ledger Demo — Seed Data", () => {
	test.beforeEach(async ({ page }) => {
		await ensureClean(page);
	});

	test("seed button populates mortgages and journal", async ({ page }) => {
		await goToPage(page);

		// Click seed
		await page.getByRole("button", { name: "Seed Demo Data" }).click();

		// Success message
		await expect(page.getByText("Seeded 2 mortgages")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// Both mortgages visible
		await expect(page.getByText("123 Greenfield Rd")).toBeVisible();
		await expect(page.getByText("456 Riverside Dr")).toBeVisible();

		// Stats badges
		await expect(page.getByText("Mortgages: 2")).toBeVisible();

		// Journal log appears
		await expect(page.getByText("Journal Log")).toBeVisible();
	});

	test("seed is idempotent — shows message if data exists", async ({
		page,
	}) => {
		await goToPage(page);

		// First seed
		await page.getByRole("button", { name: "Seed Demo Data" }).click();
		await expect(page.getByText("Seeded 2 mortgages")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// Seed button should now be disabled
		await expect(
			page.getByRole("button", { name: "Seed Demo Data" }),
		).toBeDisabled();
	});
});

// ── Mortgage Cards ──────────────────────────────────────────────
test.describe("Ledger Demo — Mortgage Cards", () => {
	test.beforeEach(async ({ page }) => {
		await ensureSeeded(page);
	});

	test("Greenfield mortgage shows correct investor positions", async ({
		page,
	}) => {
		// Alice 5000, Bob 3000, Charlie 2000
		await expect(page.getByText("Alice")).toBeVisible();
		await expect(page.getByText("Bob")).toBeVisible();
		await expect(page.getByText("Charlie")).toBeVisible();
	});

	test("Riverside mortgage shows correct positions", async ({ page }) => {
		// Alice 7000, Dave 3000
		await expect(page.getByText("Dave")).toBeVisible();
	});

	test("invariant badges show valid state (green check)", async ({
		page,
	}) => {
		// Both should show 10,000 / 10,000
		const badges = page.getByText("10,000 / 10,000");
		await expect(badges.first()).toBeVisible();
	});

	test("treasury balance shown for each mortgage", async ({ page }) => {
		// After full issuance, treasury should show "0 units (0%)" for Greenfield
		await expect(page.getByText("Treasury (unissued)").first()).toBeVisible();
	});
});

// ── Interactive Actions — Transfer ──────────────────────────────
test.describe("Ledger Demo — Transfers", () => {
	test.beforeEach(async ({ page }) => {
		await ensureSeeded(page);
	});

	test("transfer form has all required fields", async ({ page }) => {
		// The Transfer tab should be the default active tab
		await expect(page.getByText("Interactive Actions")).toBeVisible();
		await expect(page.getByText("Execute Transfer")).toBeVisible();

		// Labels
		await expect(page.getByText("Mortgage").first()).toBeVisible();
		await expect(page.getByText("Seller")).toBeVisible();
		await expect(page.getByText("Buyer Investor ID")).toBeVisible();
		await expect(page.getByText("Amount (units)").first()).toBeVisible();
	});

	test("execute a share transfer between investors", async ({ page }) => {
		// Select Greenfield mortgage
		await page
			.locator("div")
			.filter({ hasText: /^Select mortgage$/ })
			.first()
			.click();
		await page.getByRole("option", { name: /Greenfield/ }).click();

		// Select Alice as seller
		await page
			.locator("div")
			.filter({ hasText: /^Select seller$/ })
			.click();
		await page.getByRole("option", { name: /Alice/ }).click();

		// Enter buyer
		const buyerInput = page.getByPlaceholder("demo-inv-...");
		await buyerInput.first().fill("demo-inv-eve");

		// Enter amount
		const amountInput = page.getByPlaceholder("e.g. 1000");
		await amountInput.first().fill("1000");

		// Execute
		await page.getByRole("button", { name: "Execute Transfer" }).click();

		// Success message
		await expect(page.getByText("Transferred 1000 units")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// Journal should show the transfer entry
		await expect(page.getByText("SHARES TRANSFERRED").first()).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
	});

	test("minimum position help text visible", async ({ page }) => {
		await expect(page.getByText("Min position: 1,000 units")).toBeVisible();
	});
});

// ── Interactive Actions — Issue ─────────────────────────────────
test.describe("Ledger Demo — Issue Shares", () => {
	test.beforeEach(async ({ page }) => {
		await ensureSeeded(page);
	});

	test("issue tab shows correct form fields", async ({ page }) => {
		await page.getByRole("tab", { name: "Issue" }).click();

		await expect(
			page.getByRole("button", { name: "Issue Shares" }),
		).toBeVisible();
		await expect(page.getByText("Investor ID")).toBeVisible();
	});

	test("issue shares to a new investor from treasury", async ({ page }) => {
		await page.getByRole("tab", { name: "Issue" }).click();

		// Select Riverside (has 3000 treasury remaining)
		await page
			.locator("div")
			.filter({ hasText: /^Select mortgage$/ })
			.first()
			.click();
		await page.getByRole("option", { name: /Riverside.*treasury/ }).click();

		// Enter investor ID
		const investorInput = page.getByPlaceholder("demo-inv-...");
		await investorInput.first().clear();
		await investorInput.first().fill("demo-inv-frank");

		// Enter amount
		const amountInput = page.getByPlaceholder("e.g. 1000");
		await amountInput.first().fill("1000");

		// Execute
		await page.getByRole("button", { name: "Issue Shares" }).click();

		// Success message
		await expect(page.getByText("Issued 1000 units")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// New entry in journal
		await expect(page.getByText("SHARES ISSUED").first()).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
	});
});

// ── Interactive Actions — Redeem ────────────────────────────────
test.describe("Ledger Demo — Redeem Shares", () => {
	test.beforeEach(async ({ page }) => {
		await ensureSeeded(page);
	});

	test("redeem tab shows correct form fields", async ({ page }) => {
		await page.getByRole("tab", { name: "Redeem" }).click();

		await expect(
			page.getByRole("button", { name: "Redeem Shares" }),
		).toBeVisible();
		await expect(page.getByText("Investor").first()).toBeVisible();
	});

	test("redeem shares from an investor back to treasury", async ({
		page,
	}) => {
		await page.getByRole("tab", { name: "Redeem" }).click();

		// Select Greenfield mortgage
		await page
			.locator("div")
			.filter({ hasText: /^Select mortgage$/ })
			.first()
			.click();
		await page.getByRole("option", { name: /Greenfield/ }).click();

		// Select Charlie (has 2000 units)
		await page
			.locator("div")
			.filter({ hasText: /^Select investor$/ })
			.click();
		await page.getByRole("option", { name: /Charlie/ }).click();

		// Enter amount — full exit (2000)
		const amountInput = page.getByPlaceholder("e.g. 1000");
		await amountInput.first().fill("2000");

		// Execute
		await page.getByRole("button", { name: "Redeem Shares" }).click();

		// Success message
		await expect(page.getByText("Redeemed 2000 units")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// New entry in journal
		await expect(page.getByText("SHARES REDEEMED").first()).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
	});
});

// ── Journal Log ─────────────────────────────────────────────────
test.describe("Ledger Demo — Journal Log", () => {
	test.beforeEach(async ({ page }) => {
		await ensureSeeded(page);
	});

	test("journal log table is visible with entries", async ({ page }) => {
		await expect(page.getByText("Journal Log")).toBeVisible();
		await expect(page.getByText("newest first")).toBeVisible();
	});

	test("journal has correct column headers", async ({ page }) => {
		await expect(page.getByRole("columnheader", { name: "#" })).toBeVisible();
		await expect(
			page.getByRole("columnheader", { name: "Type" }),
		).toBeVisible();
		await expect(
			page.getByRole("columnheader", { name: "Amount" }),
		).toBeVisible();
		await expect(
			page.getByRole("columnheader", { name: "Flow" }),
		).toBeVisible();
		await expect(
			page.getByRole("columnheader", { name: "Source" }),
		).toBeVisible();
	});

	test("journal entries show MORTGAGE MINTED and SHARES ISSUED for seed data", async ({
		page,
	}) => {
		await expect(page.getByText("MORTGAGE MINTED").first()).toBeVisible();
		await expect(page.getByText("SHARES ISSUED").first()).toBeVisible();
	});

	test("seed entries are tagged with seed source badge", async ({ page }) => {
		// Check seed badge exists
		const seedBadges = page.locator("text=seed").filter({ hasText: "seed" });
		await expect(seedBadges.first()).toBeVisible();
	});
});

// ── Cleanup ─────────────────────────────────────────────────────
test.describe("Ledger Demo — Cleanup", () => {
	test("cleanup removes all demo data", async ({ page }) => {
		await ensureSeeded(page);

		// Click cleanup
		await page
			.getByRole("button", { name: "Clean Up All Demo Data" })
			.click();

		// Success message with counts
		await expect(page.getByText(/Cleaned up \d+ entries/)).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// Mortgage cards should be gone
		await expect(page.getByText("123 Greenfield Rd")).not.toBeVisible({
			timeout: 5_000,
		});
		await expect(page.getByText("456 Riverside Dr")).not.toBeVisible();

		// Seed button should be enabled again
		await expect(
			page.getByRole("button", { name: "Seed Demo Data" }),
		).toBeEnabled();
	});

	test("cleanup button is disabled when no data exists", async ({ page }) => {
		await ensureClean(page);

		await expect(
			page.getByRole("button", { name: "Clean Up All Demo Data" }),
		).toBeDisabled();
	});
});

// ── Full Lifecycle ──────────────────────────────────────────────
test.describe("Ledger Demo — Full Lifecycle", () => {
	test("seed → transfer → issue → redeem → cleanup", async ({ page }) => {
		// 1. Start clean
		await ensureClean(page);

		// 2. Seed
		await page.getByRole("button", { name: "Seed Demo Data" }).click();
		await expect(page.getByText("Seeded 2 mortgages")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// 3. Transfer: Alice → Eve (1000 units on Greenfield)
		// Select Greenfield
		await page
			.locator("div")
			.filter({ hasText: /^Select mortgage$/ })
			.first()
			.click();
		await page.getByRole("option", { name: /Greenfield/ }).click();

		// Select Alice as seller
		await page
			.locator("div")
			.filter({ hasText: /^Select seller$/ })
			.click();
		await page.getByRole("option", { name: /Alice/ }).click();

		// Buyer
		await page.getByPlaceholder("demo-inv-...").first().fill("demo-inv-eve");

		// Amount
		await page.getByPlaceholder("e.g. 1000").first().fill("1000");

		// Execute
		await page.getByRole("button", { name: "Execute Transfer" }).click();
		await expect(page.getByText("Transferred 1000 units")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// Verify invariant still valid
		await expect(page.getByText("10,000 / 10,000").first()).toBeVisible();

		// 4. Issue: 1000 units to new investor on Riverside
		await page.getByRole("tab", { name: "Issue" }).click();

		await page
			.locator("div")
			.filter({ hasText: /^Select mortgage$/ })
			.first()
			.click();
		await page.getByRole("option", { name: /Riverside.*treasury/ }).click();

		const issueInvestorInput = page.getByPlaceholder("demo-inv-...");
		await issueInvestorInput.first().clear();
		await issueInvestorInput.first().fill("demo-inv-grace");

		const issueAmountInput = page.getByPlaceholder("e.g. 1000");
		await issueAmountInput.first().fill("1000");

		await page.getByRole("button", { name: "Issue Shares" }).click();
		await expect(page.getByText("Issued 1000 units")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// 5. Redeem: Charlie redeems all 2000 units (full exit) from Greenfield
		await page.getByRole("tab", { name: "Redeem" }).click();

		await page
			.locator("div")
			.filter({ hasText: /^Select mortgage$/ })
			.first()
			.click();
		await page.getByRole("option", { name: /Greenfield/ }).click();

		await page
			.locator("div")
			.filter({ hasText: /^Select investor$/ })
			.click();
		await page.getByRole("option", { name: /Charlie/ }).click();

		const redeemAmountInput = page.getByPlaceholder("e.g. 1000");
		await redeemAmountInput.first().fill("2000");

		await page.getByRole("button", { name: "Redeem Shares" }).click();
		await expect(page.getByText("Redeemed 2000 units")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// 6. Verify journal has all entry types from this lifecycle
		await expect(page.getByText("SHARES TRANSFERRED").first()).toBeVisible();
		await expect(page.getByText("SHARES ISSUED").first()).toBeVisible();
		await expect(page.getByText("SHARES REDEEMED").first()).toBeVisible();
		await expect(page.getByText("MORTGAGE MINTED").first()).toBeVisible();

		// Interactive entries should have the "interactive" badge
		const interactiveBadges = page.getByText("interactive", { exact: true });
		await expect(interactiveBadges.first()).toBeVisible();

		// 7. Cleanup
		await page
			.getByRole("button", { name: "Clean Up All Demo Data" })
			.click();
		await expect(page.getByText(/Cleaned up \d+ entries/)).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// Data gone
		await expect(page.getByText("123 Greenfield Rd")).not.toBeVisible({
			timeout: 5_000,
		});
	});
});

// ── Error Handling ──────────────────────────────────────────────
test.describe("Ledger Demo — Error Handling", () => {
	test.beforeEach(async ({ page }) => {
		await ensureSeeded(page);
	});

	test("transfer button is disabled when form is incomplete", async ({
		page,
	}) => {
		// No form fields filled — button should be disabled
		await expect(
			page.getByRole("button", { name: "Execute Transfer" }),
		).toBeDisabled();
	});

	test("issue button is disabled when form is incomplete", async ({
		page,
	}) => {
		await page.getByRole("tab", { name: "Issue" }).click();
		await expect(
			page.getByRole("button", { name: "Issue Shares" }),
		).toBeDisabled();
	});

	test("redeem button is disabled when form is incomplete", async ({
		page,
	}) => {
		await page.getByRole("tab", { name: "Redeem" }).click();
		await expect(
			page.getByRole("button", { name: "Redeem Shares" }),
		).toBeDisabled();
	});
});
