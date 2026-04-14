import { expect, test } from "@playwright/test";

// ── Helpers ──────────────────────────────────────────────────────
const BASE = "/demo/governed-transitions";
const COMMAND_CENTER = `${BASE}/`;
const DATA_LOAD_TIMEOUT = 15_000;

/**
 * Navigate to a tab within the governed-transitions layout and wait
 * for the page to settle.
 */
async function goToTab(
	page: import("@playwright/test").Page,
	path: string,
	heading?: string,
) {
	await page.goto(path ? `${BASE}${path}` : COMMAND_CENTER);
	if (heading) {
		const headingLocator =
			heading === "Create Application"
				? page.getByRole("button", { name: heading })
				: heading === "Transition Journal"
					? page.getByRole("heading", { name: heading })
					: page.getByText(heading, { exact: true }).first();

		await expect(headingLocator).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
	}
}

function getStatCard(page: import("@playwright/test").Page, label: string) {
	return page
		.locator("[data-slot='card-content']")
		.filter({ has: page.getByText(label, { exact: true }) })
		.first();
}

/**
 * Reset the demo by clicking "Reset Demo" and waiting for the entity list
 * to clear. This ensures each test starts with a clean slate.
 */
async function resetDemo(page: import("@playwright/test").Page) {
	await goToTab(page, "");
	await expect(page.getByRole("button", { name: "Create Application" })).toBeVisible({
		timeout: DATA_LOAD_TIMEOUT,
	});
	await page.getByRole("button", { name: "Reset Demo" }).click();
	// Wait for the empty state to appear, confirming the reset completed
	await expect(
		page.getByText("No entities yet. Create one or seed sample data."),
	).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
}

/**
 * Create an application entity with the given fields.
 * Waits for the entity to appear in the list before returning.
 */
async function createApplication(
	page: import("@playwright/test").Page,
	opts: { label: string; loanAmount: string; applicantName?: string },
) {
	await page.getByLabel("Label").fill(opts.label);
	await page.getByLabel("Loan Amount").fill(opts.loanAmount);
	if (opts.applicantName) {
		await page.getByLabel(/Applicant Name/).fill(opts.applicantName);
	}
	await page.getByRole("button", { name: "Create Application" }).click();
	await expect(getEntityCard(page, opts.label)).toBeVisible({
		timeout: DATA_LOAD_TIMEOUT,
	});
}

function getEntityCard(page: import("@playwright/test").Page, label: string) {
	return page.locator("button").filter({ hasText: label }).first();
}

/**
 * Select (expand) an entity card by clicking it. Waits for the "Send All
 * Events" section to appear, confirming the card is expanded.
 */
async function selectEntity(
	page: import("@playwright/test").Page,
	label: string,
) {
	const entityCard = getEntityCard(page, label);
	await entityCard.click();
	await expect(page.getByText("Send All Events", { exact: true })).toBeVisible({
		timeout: DATA_LOAD_TIMEOUT,
	});
}

// ── Layout & Navigation ─────────────────────────────────────────
test.describe("Governed Transitions — Layout", () => {
	test("renders layout with heading and all three navigation tabs", async ({
		page,
	}) => {
		await goToTab(page, "/journal", "Transition Journal");

		await expect(
			page.getByRole("heading", { name: "Governed Transitions" }),
		).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });

		await expect(page.getByRole("link", { name: "Command Center" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Journal" })).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Machine Inspector" }),
		).toBeVisible();
	});

	test("tabs navigate between pages", async ({ page }) => {
		await page.goto(COMMAND_CENTER);

		// Navigate to Journal tab
		await page.getByRole("link", { name: "Journal" }).click();
		await expect(
			page.getByRole("heading", { name: "Transition Journal" }),
		).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// Navigate to Machine Inspector tab
		await page.getByRole("link", { name: "Machine Inspector" }).click();
		await expect(page.getByText("Transition Table", { exact: true })).toBeVisible(
			{
				timeout: DATA_LOAD_TIMEOUT,
			},
		);

		// Navigate back to Command Center tab
		await page.getByRole("link", { name: "Command Center" }).click();
		await expect(
			page.getByRole("button", { name: "Create Application" }),
		).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
	});
});

// ── T-040: Create entity and verify draft status ────────────────
test.describe("Governed Transitions — UC-1: Create Entity", () => {
	test.beforeEach(async ({ page }) => {
		await resetDemo(page);
	});

	test("fill in label and loan amount, create entity, verify it appears with draft status", async ({
		page,
	}) => {
		await createApplication(page, {
			label: "E2E Draft Test",
			loanAmount: "250000",
		});

		// Verify entity appears in the list
		await expect(getEntityCard(page, "E2E Draft Test")).toBeVisible();

		// Verify it shows the loan amount
		await expect(getEntityCard(page, "E2E Draft Test")).toContainText(
			"$250,000",
		);

		// Verify the status badge shows "draft"
		await expect(getEntityCard(page, "E2E Draft Test")).toContainText("draft");
	});
});

// ── T-041: Create entity, submit valid transition ───────────────
test.describe("Governed Transitions — UC-2: Valid Transition", () => {
	test.beforeEach(async ({ page }) => {
		await resetDemo(page);
	});

	test("create entity with applicant name, click SUBMIT, verify status changes to submitted", async ({
		page,
	}) => {
		// Create an entity with applicantName (required by SUBMIT guard)
		await createApplication(page, {
			label: "E2E Submit Test",
			loanAmount: "300000",
			applicantName: "Test Borrower",
		});

		// Select the entity to expand it
		await selectEntity(page, "E2E Submit Test");

		// In the "Valid Transitions" section, click the SUBMIT button
		// The valid transition buttons show "{eventType} -> {targetState}"
		await page
			.getByRole("button", { name: /SUBMIT.*submitted/ })
			.first()
			.click();

		// Verify the status badge changes to "submitted"
		await expect(
			getEntityCard(page, "E2E Submit Test"),
		).toContainText("submitted");
	});
});

// ── T-042: Invalid transition — rejection journal entry ─────────
test.describe("Governed Transitions — UC-3: Invalid Transition", () => {
	test.beforeEach(async ({ page }) => {
		await resetDemo(page);
	});

	test("create entity in draft, send APPROVE (invalid from draft), verify status remains draft, check journal for rejection", async ({
		page,
	}) => {
		// Create entity (no applicantName needed since we won't submit)
		await createApplication(page, {
			label: "E2E Reject Test",
			loanAmount: "100000",
		});

		// Select the entity to expand it
		await selectEntity(page, "E2E Reject Test");

		// In the "Send All Events" section, click APPROVE (invalid from draft)
		// This button is styled with opacity-50 and cursor-not-allowed but is clickable
		const allEventsSection = page
			.locator("div")
			.filter({ hasText: "Send All Events" });
		await allEventsSection.getByRole("button", { name: "APPROVE" }).click();

		// Verify entity status remains "draft"
		await expect(getEntityCard(page, "E2E Reject Test")).toContainText("draft");

		// Navigate to Journal tab and verify a rejection entry exists
		await page.getByRole("link", { name: "Journal" }).click();
		await expect(
			page.getByRole("heading", { name: "Transition Journal" }),
		).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// The journal entry message format is: "{eventType}: {previousState} -> {newState} (reason)"
		// For a rejection: "APPROVE: draft -> draft (No valid transition...)"
		await expect(
			page.getByText(/APPROVE.*draft.*draft/).first(),
		).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });

		// Verify the entry shows "rejected" outcome
		await expect(page.getByText("rejected").first()).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
	});
});

// ── T-043: Full lifecycle journal entries ────────────────────────
test.describe("Governed Transitions — UC-4: Full Lifecycle Journal", () => {
	test.beforeEach(async ({ page }) => {
		await resetDemo(page);
	});

	test("run full lifecycle, navigate to journal, verify 5 journal entries with correct event types", async ({
		page,
	}) => {
		// Click "Run Full Lifecycle" button
		await page.getByRole("button", { name: "Run Full Lifecycle" }).click();

		// Wait for the lifecycle entity to appear in "closed" state
		await expect(
			getEntityCard(page, "Lifecycle Demo"),
		).toContainText("closed");

		// Navigate to Journal tab
		await page.getByRole("link", { name: "Journal" }).click();
		await expect(
			page.getByRole("heading", { name: "Transition Journal" }),
		).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// The full lifecycle runs 5 transitions:
		// SUBMIT, ASSIGN_REVIEWER, APPROVE, FUND, CLOSE
		// Each creates a journal entry with a message like "EVENTTYPE: from -> to"
		await expect(
			page.getByText(/SUBMIT.*draft.*submitted/).first(),
		).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
		await expect(
			page.getByText(/ASSIGN_REVIEWER.*submitted.*under_review/).first(),
		).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
		await expect(
			page.getByText(/APPROVE.*under_review.*approved/).first(),
		).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
		await expect(
			page.getByText(/FUND.*approved.*funded/).first(),
		).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
		await expect(
			page.getByText(/CLOSE.*funded.*closed/).first(),
		).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });

		// Verify stats subtitle shows 5 total transitioned entries
		await expect(
			page.getByText(/5 total/).first(),
		).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
	});
});

// ── T-044: Run Full Lifecycle — entity in closed state ──────────
test.describe("Governed Transitions — UC-6: Run Full Lifecycle", () => {
	test.beforeEach(async ({ page }) => {
		await resetDemo(page);
	});

	test("click Run Full Lifecycle, verify entity appears in closed state", async ({
		page,
	}) => {
		// Click "Run Full Lifecycle" button
		await page.getByRole("button", { name: "Run Full Lifecycle" }).click();

		// Verify a "Lifecycle Demo" entity appears
		await expect(getEntityCard(page, "Lifecycle Demo")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// Verify it shows "closed" status badge
		await expect(getEntityCard(page, "Lifecycle Demo")).toContainText("closed");

		// Verify it shows the lifecycle loan amount ($500,000)
		await expect(getEntityCard(page, "Lifecycle Demo")).toContainText(
			"$500,000",
		);
	});
});

// ── T-045A: Journal route is read-only ──────────────────────────
test.describe("Governed Transitions — T-045A: Journal Read-Only", () => {
	test.beforeEach(async ({ page }) => {
		await resetDemo(page);

		// Run a lifecycle so journal has entries to search/filter
		await page.getByRole("button", { name: "Run Full Lifecycle" }).click();
		await expect(
			getEntityCard(page, "Lifecycle Demo"),
		).toContainText("closed");
	});

	test("journal page has filter controls but no mutation buttons", async ({
		page,
	}) => {
		await goToTab(page, "/journal", "Transition Journal");

		// ── Read-only affordances ARE present ──

		// Stats bar cards exist
		await expect(getStatCard(page, "Total")).toBeVisible();
		await expect(getStatCard(page, "Transitioned")).toBeVisible();
		await expect(getStatCard(page, "Rejected")).toBeVisible();

		// Entity filter dropdown trigger exists
		await expect(page.getByRole("combobox")).toBeVisible();

		// Outcome toggle buttons exist
		const outcomeAll = page.getByRole("button", { name: "All", exact: true });
		await expect(outcomeAll.first()).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Transitioned", exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Rejected", exact: true }),
		).toBeVisible();

		// Search input exists inside InteractiveLogsTable
		await expect(
			page.getByPlaceholder("Search logs by message or service..."),
		).toBeVisible();

		// ── Mutation buttons must NOT exist ──
		const mutationLabels = [
			"Create Application",
			"Reset Demo",
			"Seed Data",
			"Run Full Lifecycle",
			"SUBMIT",
			"APPROVE",
			"REJECT",
			"FUND",
			"CLOSE",
			"ASSIGN_REVIEWER",
			"REQUEST_INFO",
			"RESUBMIT",
			"REOPEN",
		];

		for (const label of mutationLabels) {
			await expect(
				page.getByRole("button", { name: label, exact: true }),
			).toHaveCount(0);
		}
	});

	test("journal search input filters entries", async ({ page }) => {
		await goToTab(page, "/journal", "Transition Journal");

		// Verify entries exist before searching
		await expect(page.getByText(/SUBMIT.*draft.*submitted/).first()).toBeVisible(
			{ timeout: DATA_LOAD_TIMEOUT },
		);

		// Type a search query that matches one event
		const searchInput = page.getByPlaceholder(
			"Search logs by message or service...",
		);
		await searchInput.fill("CLOSE");

		// The CLOSE entry should be visible
		await expect(page.getByText(/CLOSE.*funded.*closed/).first()).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});
	});
});

// ── T-045B: Machine route is read-only ──────────────────────────
test.describe("Governed Transitions — T-045B: Machine Read-Only", () => {
	test("machine page renders visualization and transition table but no mutation buttons", async ({
		page,
	}) => {
		await goToTab(page, "/machine", "Transition Table");

		// ── Machine visualization IS present ──
		await expect(page.getByText("Loan Application Lifecycle")).toBeVisible({
			timeout: DATA_LOAD_TIMEOUT,
		});

		// Read-Only badge is visible (set by readOnly={true} on N8nWorkflowBlock)
		await expect(page.getByText("Read-Only", { exact: true })).toBeVisible();

		// Transition Table heading and column headers are present
		await expect(page.getByText("Transition Table", { exact: true })).toBeVisible();
		await expect(
			page.getByRole("columnheader", { name: "From State" }),
		).toBeVisible();
		await expect(
			page.getByRole("columnheader", { name: "Event" }),
		).toBeVisible();
		await expect(
			page.getByRole("columnheader", { name: "Guard" }),
		).toBeVisible();
		await expect(
			page.getByRole("columnheader", { name: "To State" }),
		).toBeVisible();
		await expect(
			page.getByRole("columnheader", { name: "Actions" }),
		).toBeVisible();

		// State names are visible in the workflow diagram nodes
		await expect(page.getByText("draft").first()).toBeVisible();
		await expect(page.getByText("submitted").first()).toBeVisible();

		// Entity highlight selector exists
		await expect(
			page.getByText("Highlight entity state:", { exact: true }),
		).toBeVisible();

		// ── "Add Node" button must NOT exist (hidden by readOnly) ──
		await expect(
			page.getByRole("button", { name: "Add new node" }),
		).toHaveCount(0);

		// ── Mutation buttons must NOT exist ──
		const mutationLabels = [
			"Create Application",
			"Reset Demo",
			"Seed Data",
			"Run Full Lifecycle",
			"SUBMIT",
			"APPROVE",
			"REJECT",
			"FUND",
			"CLOSE",
			"ASSIGN_REVIEWER",
			"REQUEST_INFO",
			"RESUBMIT",
			"REOPEN",
		];

		for (const label of mutationLabels) {
			await expect(
				page.getByRole("button", { name: label, exact: true }),
			).toHaveCount(0);
		}
	});
});

// ── T-045C: Command Center actions update observer surfaces reactively ──
test.describe(
	"Governed Transitions — T-045C: Reactive Cross-Surface Updates",
	() => {
		test.beforeEach(async ({ page }) => {
			await resetDemo(page);
		});

		test("successful transition appears in journal", async ({ page }) => {
			// Create entity with applicantName (required by SUBMIT guard)
			await createApplication(page, {
				label: "E2E Reactive Success",
				loanAmount: "450000",
				applicantName: "Reactive Borrower",
			});

			// Select entity and send SUBMIT (valid from draft)
			await selectEntity(page, "E2E Reactive Success");
			await page
				.getByRole("button", { name: /SUBMIT.*submitted/ })
				.first()
				.click();

			// Verify entity shows "submitted" on Command Center
			await expect(getEntityCard(page, "E2E Reactive Success")).toContainText(
				"submitted",
			);

			// Navigate to Journal tab
			await page.getByRole("link", { name: "Journal" }).click();
			await expect(
				page.getByRole("heading", { name: "Transition Journal" }),
			).toBeVisible({
				timeout: DATA_LOAD_TIMEOUT,
			});

			// Verify journal entry for the successful transition
			await expect(
				page.getByText(/SUBMIT.*draft.*submitted/).first(),
			).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });

			// Verify outcome shows "transitioned"
			await expect(page.getByText("transitioned").first()).toBeVisible({
				timeout: DATA_LOAD_TIMEOUT,
			});

			// Navigate back to Command Center and verify entity still shows "submitted"
			await page.getByRole("link", { name: "Command Center" }).click();
			await expect(getEntityCard(page, "E2E Reactive Success")).toContainText(
				"submitted",
			);
		});

		test("rejected transition appears in journal with entity staying in original state", async ({
			page,
		}) => {
			// Create entity without applicantName, keep in draft
			await createApplication(page, {
				label: "E2E Reactive Reject",
				loanAmount: "200000",
			});

			// Select entity and send APPROVE (invalid from draft)
			await selectEntity(page, "E2E Reactive Reject");
			const allEventsSection = page
				.locator("div")
				.filter({ hasText: "Send All Events" });
			await allEventsSection
				.getByRole("button", { name: "APPROVE" })
				.click();

			// Verify entity remains in "draft" on Command Center
			await expect(getEntityCard(page, "E2E Reactive Reject")).toContainText(
				"draft",
			);

			// Navigate to Journal tab
			await page.getByRole("link", { name: "Journal" }).click();
			await expect(
				page.getByRole("heading", { name: "Transition Journal" }),
			).toBeVisible({
				timeout: DATA_LOAD_TIMEOUT,
			});

			// Verify rejection entry exists
			await expect(
				page.getByText(/APPROVE.*draft.*draft/).first(),
			).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });

			// Verify outcome shows "rejected"
			await expect(page.getByText("rejected").first()).toBeVisible({
				timeout: DATA_LOAD_TIMEOUT,
			});
		});
	},
);
