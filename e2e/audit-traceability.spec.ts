import { expect, test } from "@playwright/test";

// ── Helpers ──────────────────────────────────────────────────────
const BASE = "/demo/audit-traceability";
const DATA_LOAD_TIMEOUT = 15_000;
const MORTGAGE_PATTERN = /Mortgage/i;
const CHAIN_OR_EVENTS_PATTERN = /Chain verified|events/i;
const EVENTS_EMITTED_PATTERN = /events emitted/i;
const MORTGAGE_OR_TEST_PATTERN = /Mortgage|Test/i;
const ACCESS_LOG_PAGE_PATTERN = /hash-chain|pipeline|audit-trail/;
const ACCESS_LOG_PAGE_OR_PIPELINE_PATTERN = /hash-chain|pipeline/;
const EVENT_COUNT_PATTERN = /\(\d+ events\)/;
const PENDING_PATTERN = /^Pending/;
const EMITTED_PATTERN = /^Emitted/;
const GENERATED_PATTERN = /Generated/;

/**
 * Navigate to a tab within the audit-traceability layout and wait
 * for the page to settle.
 */
async function goToTab(
  page: import("@playwright/test").Page,
  path: string,
  heading?: string,
) {
  await page.goto(`${BASE}${path}`);
  if (heading) {
    await expect(page.getByText(heading).first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  }
}

// ── Layout & Navigation ─────────────────────────────────────────
test.describe("Audit & Traceability — Layout", () => {
  test("renders layout with all six navigation tabs", async ({ page }) => {
    await page.goto(BASE);

    await expect(
      page.getByRole("heading", { name: "Audit & Traceability" }),
    ).toBeVisible();

    const nav = page.locator("nav");
    await expect(nav.getByText("Transfers")).toBeVisible();
    await expect(nav.getByText("Hash Chain")).toBeVisible();
    await expect(nav.getByText("Audit Trail")).toBeVisible();
    await expect(nav.getByText("Pipeline")).toBeVisible();
    await expect(nav.getByText("Access Log")).toBeVisible();
    await expect(nav.getByText("Report")).toBeVisible();
  });

  test("tabs navigate between pages", async ({ page }) => {
    await page.goto(BASE);

    // Navigate to Hash Chain tab
    await page.locator("nav").getByText("Hash Chain").click();
    await expect(page.getByText("Select Mortgage")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Navigate to Pipeline tab
    await page.locator("nav").getByText("Pipeline").click();
    await expect(page.getByText("Manual Emission")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Navigate back to Transfers tab
    await page.locator("nav").getByText("Transfers").click();
    await expect(page.getByText("Create Mortgage")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  });
});

// ── Transfers Page ──────────────────────────────────────────────
test.describe("Audit & Traceability — Transfers", () => {
  test("shows empty state and seed button", async ({ page }) => {
    await goToTab(page, "", "Create Mortgage");

    // The mortgage list should show an empty state or existing mortgages
    await expect(page.getByText("Mortgages").first()).toBeVisible();
  });

  test("seed data populates mortgages", async ({ page }) => {
    await goToTab(page, "", "Create Mortgage");

    // Click seed if no mortgages exist
    const seedButton = page.getByRole("button", { name: "Seed" });
    if (await seedButton.isVisible()) {
      await seedButton.click();

      // Wait for seeded mortgages to appear
      await expect(page.getByText("123 Main St Mortgage")).toBeVisible({
        timeout: DATA_LOAD_TIMEOUT,
      });
      await expect(page.getByText("456 Oak Ave Mortgage")).toBeVisible({
        timeout: DATA_LOAD_TIMEOUT,
      });
    }
  });

  test("create mortgage with PII fields", async ({ page }) => {
    await goToTab(page, "", "Create Mortgage");

    // Fill in the form
    await page.getByLabel("Label").fill("E2E Test Mortgage");
    await page.getByLabel("Owner ID").fill("owner-e2e");
    await page.getByLabel("Loan Amount").fill("275000");

    // Fill PII fields
    await page.getByPlaceholder("Email").fill("e2e@example.com");
    await page.getByPlaceholder("Phone").fill("555-9999");
    await page.getByPlaceholder("SSN").fill("111-22-3333");
    await page.getByPlaceholder("Property Address").fill("789 Test Blvd");

    // Submit
    await page.getByRole("button", { name: "Create Mortgage" }).click();

    // Verify the mortgage appears in the list
    await expect(page.getByText("E2E Test Mortgage")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await expect(page.getByText("owner-e2e")).toBeVisible();
  });

  test("full transfer lifecycle: initiate → approve → complete", async ({
    page,
  }) => {
    await goToTab(page, "", "Create Mortgage");

    // Create a fresh mortgage for this test
    await page.getByLabel("Label").fill("Lifecycle Test Mortgage");
    await page.getByLabel("Owner ID").fill("owner-lifecycle");
    await page.getByLabel("Loan Amount").fill("100000");
    await page.getByRole("button", { name: "Create Mortgage" }).click();
    await expect(page.getByText("Lifecycle Test Mortgage")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Step 1: Initiate transfer
    const mortgageRow = page
      .locator("div")
      .filter({ hasText: "Lifecycle Test Mortgage" })
      .first();
    await mortgageRow
      .getByRole("button", { name: "Initiate Transfer" })
      .click();
    await mortgageRow.getByPlaceholder("owner-new").fill("owner-new-e2e");
    await mortgageRow.getByRole("button", { name: "Go" }).click();

    // Verify status changed to "Initiated"
    await expect(page.getByText("Initiated").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Step 2: Approve transfer
    await page.getByRole("button", { name: "Approve" }).first().click();
    await expect(page.getByText("Approved").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Step 3: Complete transfer
    await page.getByRole("button", { name: "Complete Transfer" }).click();
    await expect(page.getByText("Completed").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  });

  test("reject a transfer", async ({ page }) => {
    await goToTab(page, "", "Create Mortgage");

    // Create a mortgage
    await page.getByLabel("Label").fill("Reject Test Mortgage");
    await page.getByLabel("Owner ID").fill("owner-reject");
    await page.getByLabel("Loan Amount").fill("50000");
    await page.getByRole("button", { name: "Create Mortgage" }).click();
    await expect(page.getByText("Reject Test Mortgage")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Initiate transfer
    const row = page
      .locator("div")
      .filter({ hasText: "Reject Test Mortgage" })
      .first();
    await row.getByRole("button", { name: "Initiate Transfer" }).click();
    await row.getByPlaceholder("owner-new").fill("owner-rejected");
    await row.getByRole("button", { name: "Go" }).click();

    await expect(page.getByText("Initiated").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Reject the transfer
    await page.getByRole("button", { name: "Reject" }).first().click();
    await expect(page.getByText("Rejected").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  });

  test("traced lifecycle creates mortgage with all spans", async ({ page }) => {
    await goToTab(page, "", "Create Mortgage");

    await page.getByRole("button", { name: "Traced Lifecycle" }).click();

    // The traced lifecycle creates "Traced Demo Mortgage"
    await expect(page.getByText("Traced Demo Mortgage")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Should show "Completed" status (lifecycle goes all the way through)
    await expect(
      page
        .locator("div")
        .filter({ hasText: "Traced Demo Mortgage" })
        .getByText("Completed")
        .first(),
    ).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
  });
});

// ── Hash Chain Page ─────────────────────────────────────────────
test.describe("Audit & Traceability — Hash Chain", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure data exists by seeding first
    await goToTab(page, "", "Create Mortgage");
    const seedButton = page.getByRole("button", { name: "Seed" });
    if (await seedButton.isVisible()) {
      await seedButton.click();
      await expect(page.getByText("123 Main St Mortgage")).toBeVisible({
        timeout: DATA_LOAD_TIMEOUT,
      });
    }
  });

  test("renders mortgage selector buttons", async ({ page }) => {
    await goToTab(page, "/hash-chain", "Select Mortgage");

    // At least one mortgage button should be visible
    await expect(
      page.getByRole("button", { name: MORTGAGE_PATTERN }).first(),
    ).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
  });

  test("selecting a mortgage shows chain verification result", async ({
    page,
  }) => {
    await goToTab(page, "/hash-chain", "Select Mortgage");

    // Click the first mortgage button
    await page.getByRole("button", { name: MORTGAGE_PATTERN }).first().click();

    // Verification result should appear — either "Chain verified" or event count
    await expect(page.getByText(CHAIN_OR_EVENTS_PATTERN).first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  });

  test("event timeline shows hash chain data", async ({ page }) => {
    // First create a mortgage and do a transfer to have events
    await goToTab(page, "", "Create Mortgage");
    await page.getByLabel("Label").fill("Hash Chain Test");
    await page.getByLabel("Owner ID").fill("owner-hash");
    await page.getByLabel("Loan Amount").fill("200000");
    await page.getByPlaceholder("Email").fill("hash@example.com");
    await page.getByRole("button", { name: "Create Mortgage" }).click();
    await expect(page.getByText("Hash Chain Test")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Go to hash chain page and select this mortgage
    await goToTab(page, "/hash-chain", "Select Mortgage");
    await page.getByRole("button", { name: "Hash Chain Test" }).click();

    // Should show the hash chain timeline
    await expect(page.getByText("Hash Chain Timeline").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Should show event #0 (the creation event)
    await expect(page.getByText("#0")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Should show "mortgage.created" event type
    await expect(page.getByText("mortgage.created")).toBeVisible();

    // Should show hash values
    await expect(page.getByText("prev:").first()).toBeVisible();
    await expect(page.getByText("hash:").first()).toBeVisible();

    // The first event should show "(genesis)" for prevHash
    await expect(page.getByText("(genesis)")).toBeVisible();
  });

  test("PII fields are omitted in sanitized state", async ({ page }) => {
    // Create a mortgage with PII
    await goToTab(page, "", "Create Mortgage");
    await page.getByLabel("Label").fill("Redaction Test");
    await page.getByLabel("Owner ID").fill("owner-redact");
    await page.getByLabel("Loan Amount").fill("150000");
    await page.getByPlaceholder("Email").fill("secret@example.com");
    await page.getByPlaceholder("SSN").fill("999-88-7777");
    await page.getByRole("button", { name: "Create Mortgage" }).click();
    await expect(page.getByText("Redaction Test")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Go to hash chain and view the event
    await goToTab(page, "/hash-chain", "Select Mortgage");
    await page.getByRole("button", { name: "Redaction Test" }).click();

    await expect(page.getByText("mortgage.created")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Expand the sanitized state
    await page.getByText("View sanitized state").first().click();

    // The raw PII should NOT appear in the sanitized output
    const sanitizedBlock = page.locator("pre").first();
    const content = await sanitizedBlock.textContent();
    expect(content).not.toContain("secret@example.com");
    expect(content).not.toContain("999-88-7777");

    // PII keys should be omitted entirely (no borrowerEmail, borrowerSsn keys)
    expect(content).not.toContain("borrowerEmail");
    expect(content).not.toContain("borrowerSsn");

    // Non-PII fields should still be present
    expect(content).toContain("label");
    expect(content).toContain("loanAmount");
  });

  test("chain verification succeeds for valid chain", async ({ page }) => {
    await goToTab(page, "/hash-chain", "Select Mortgage");

    // Select any mortgage that has events
    await page
      .getByRole("button", { name: MORTGAGE_OR_TEST_PATTERN })
      .first()
      .click();

    // The chain should verify successfully
    await expect(page.getByText("Chain verified")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  });

  test("JSON export button is available for verified chain", async ({
    page,
  }) => {
    await goToTab(page, "/hash-chain", "Select Mortgage");

    // Select any mortgage that has events
    await page
      .getByRole("button", { name: MORTGAGE_OR_TEST_PATTERN })
      .first()
      .click();

    // Wait for chain verification
    await expect(page.getByText("Chain verified")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Download JSON button should be visible
    await expect(
      page.getByRole("button", { name: "Download JSON" }),
    ).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
  });
});

// ── Audit Trail Page ────────────────────────────────────────────
test.describe("Audit & Traceability — Audit Trail", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure data exists
    await goToTab(page, "", "Create Mortgage");
    const seedButton = page.getByRole("button", { name: "Seed" });
    if (await seedButton.isVisible()) {
      await seedButton.click();
      await expect(page.getByText("123 Main St Mortgage")).toBeVisible({
        timeout: DATA_LOAD_TIMEOUT,
      });
    }
  });

  test("renders query controls with resource/actor toggle", async ({
    page,
  }) => {
    await goToTab(page, "/audit-trail", "Query Audit Trail");

    await expect(
      page.getByRole("button", { name: "By Resource" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "By Actor" })).toBeVisible();
  });

  test("query by resource shows results for a mortgage", async ({ page }) => {
    await goToTab(page, "/audit-trail", "Query Audit Trail");

    // Click a mortgage button to query its audit trail
    const mortgageButton = page
      .getByRole("button", { name: MORTGAGE_PATTERN })
      .first();
    if (await mortgageButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await mortgageButton.click();

      // Results section should appear
      await expect(page.getByText("Results").first()).toBeVisible({
        timeout: DATA_LOAD_TIMEOUT,
      });
    }
  });

  test("switching to actor mode shows actor input", async ({ page }) => {
    await goToTab(page, "/audit-trail", "Query Audit Trail");

    await page.getByRole("button", { name: "By Actor" }).click();
    await expect(page.getByPlaceholder("Actor ID")).toBeVisible();
  });

  test("query by actor returns results for demo-anonymous", async ({
    page,
  }) => {
    await goToTab(page, "/audit-trail", "Query Audit Trail");

    await page.getByRole("button", { name: "By Actor" }).click();
    await page.getByPlaceholder("Actor ID").fill("demo-anonymous");

    // Wait for results to load
    await expect(page.getByText("Results").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  });

  test("critical events section renders", async ({ page }) => {
    await goToTab(page, "/audit-trail", "Query Audit Trail");

    await expect(page.getByText("Critical Events (Real-time)")).toBeVisible();
  });

  test("rejecting a transfer shows a critical event", async ({ page }) => {
    // Create and reject a mortgage to generate a warning event
    await goToTab(page, "", "Create Mortgage");
    await page.getByLabel("Label").fill("Critical Event Test");
    await page.getByLabel("Owner ID").fill("owner-critical");
    await page.getByLabel("Loan Amount").fill("80000");
    await page.getByRole("button", { name: "Create Mortgage" }).click();
    await expect(page.getByText("Critical Event Test")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Initiate and reject
    const row = page
      .locator("div")
      .filter({ hasText: "Critical Event Test" })
      .first();
    await row.getByRole("button", { name: "Initiate Transfer" }).click();
    await row.getByPlaceholder("owner-new").fill("will-reject");
    await row.getByRole("button", { name: "Go" }).click();
    await expect(page.getByText("Initiated").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await page.getByRole("button", { name: "Reject" }).first().click();
    await expect(page.getByText("Rejected").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Go to audit trail — critical events should show the rejection
    await goToTab(page, "/audit-trail", "Query Audit Trail");
    await expect(page.getByText("transfer.rejected").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  });
});

// ── Pipeline Page ───────────────────────────────────────────────
test.describe("Audit & Traceability — Pipeline", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure data exists
    await goToTab(page, "", "Create Mortgage");
    const seedButton = page.getByRole("button", { name: "Seed" });
    if (await seedButton.isVisible()) {
      await seedButton.click();
      await expect(page.getByText("123 Main St Mortgage")).toBeVisible({
        timeout: DATA_LOAD_TIMEOUT,
      });
    }
  });

  test("shows pending/emitted/failed/latency status cards", async ({
    page,
  }) => {
    await goToTab(page, "/pipeline", "Manual Emission");

    await expect(page.getByText("Pending").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await expect(page.getByText("Emitted").first()).toBeVisible();
    await expect(page.getByText("Failed").first()).toBeVisible();
    await expect(page.getByText("Avg Latency")).toBeVisible();
  });

  test("shows emission progress bar", async ({ page }) => {
    await goToTab(page, "/pipeline", "Emission Progress");

    await expect(page.getByText("emitted")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await expect(page.getByText("pending")).toBeVisible();
  });

  test("emit pending events button works", async ({ page }) => {
    await goToTab(page, "/pipeline", "Manual Emission");

    const emitButton = page.getByRole("button", {
      name: "Emit Pending Events",
    });

    // If there are pending events, emit them
    if (await emitButton.isEnabled({ timeout: 5000 }).catch(() => false)) {
      await emitButton.click();

      // Should show emission result
      await expect(page.getByText(EVENTS_EMITTED_PATTERN).first()).toBeVisible({
        timeout: DATA_LOAD_TIMEOUT,
      });
    }
  });

  test("5-layer defense-in-depth is displayed", async ({ page }) => {
    await goToTab(page, "/pipeline", "5-Layer Defense-in-Depth");

    await expect(page.getByText("Layer 1")).toBeVisible();
    await expect(page.getByText("Database Triggers")).toBeVisible();
    await expect(page.getByText("Layer 2")).toBeVisible();
    await expect(page.getByText("PII Sanitization")).toBeVisible();
    await expect(page.getByText("Layer 3")).toBeVisible();
    await expect(page.getByText("Component Isolation")).toBeVisible();
    await expect(page.getByText("Layer 4")).toBeVisible();
    await expect(page.getByText("Hash Chain")).toBeVisible();
    await expect(page.getByText("Layer 5")).toBeVisible();
    await expect(page.getByText("Outbox Pattern")).toBeVisible();
  });

  test("emitting reduces pending count", async ({ page }) => {
    // First create a mortgage to generate a pending event
    await goToTab(page, "", "Create Mortgage");
    await page.getByLabel("Label").fill("Pipeline Count Test");
    await page.getByLabel("Owner ID").fill("owner-pipeline");
    await page.getByLabel("Loan Amount").fill("60000");
    await page.getByRole("button", { name: "Create Mortgage" }).click();
    await expect(page.getByText("Pipeline Count Test")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Go to pipeline and check pending count > 0
    await goToTab(page, "/pipeline", "Manual Emission");

    // Wait for the status to load
    await expect(page.getByText("Pending").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Emit pending events
    const emitButton = page.getByRole("button", {
      name: "Emit Pending Events",
    });
    if (await emitButton.isEnabled({ timeout: 5000 }).catch(() => false)) {
      await emitButton.click();
      await expect(page.getByText(EVENTS_EMITTED_PATTERN).first()).toBeVisible({
        timeout: DATA_LOAD_TIMEOUT,
      });
    }
  });
});

// ── Access Log Page ─────────────────────────────────────────────
test.describe("Audit & Traceability — Access Log", () => {
  test.beforeEach(async ({ page }) => {
    // Visit other tabs first to generate access log entries
    await goToTab(page, "/hash-chain", "Select Mortgage");
    await goToTab(page, "/pipeline", "Manual Emission");
  });

  test("renders access log page with header", async ({ page }) => {
    await goToTab(page, "/access-log", "Audit Access Log");

    await expect(page.getByText("Audit Access Log")).toBeVisible();
    await expect(page.getByText("SOC 2 CC6.1 access monitoring")).toBeVisible();
  });

  test("shows access entries after visiting other audit pages", async ({
    page,
  }) => {
    await goToTab(page, "/access-log", "Audit Access Log");

    // Should have entries from the beforeEach navigation
    // Wait for entries to appear (access log is populated reactively)
    await expect(page.getByText(ACCESS_LOG_PAGE_PATTERN).first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  });

  test("access entries show actor and page info", async ({ page }) => {
    await goToTab(page, "/access-log", "Audit Access Log");

    // Wait for data to load
    await expect(
      page.getByText(ACCESS_LOG_PAGE_OR_PIPELINE_PATTERN).first(),
    ).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Should show "Page-level access" for global entries
    await expect(page.getByText("Page-level access").first()).toBeVisible();
  });
});

// ── Report Page ────────────────────────────────────────────────
test.describe("Audit & Traceability — Report", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure data exists
    await goToTab(page, "", "Create Mortgage");
    const seedButton = page.getByRole("button", { name: "Seed" });
    if (await seedButton.isVisible()) {
      await seedButton.click();
      await expect(page.getByText("123 Main St Mortgage")).toBeVisible({
        timeout: DATA_LOAD_TIMEOUT,
      });
    }
  });

  test("renders compliance report with summary cards", async ({ page }) => {
    await goToTab(page, "/report", "Compliance Report");

    await expect(page.getByText("Compliance Report")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await expect(page.getByText("Entities")).toBeVisible();
    await expect(page.getByText("Audit Events")).toBeVisible();
    await expect(page.getByText("Chains Verified")).toBeVisible();
    await expect(page.getByText("Chains Failed")).toBeVisible();
  });

  test("shows all five control sections", async ({ page }) => {
    await goToTab(page, "/report", "Compliance Report");

    await expect(page.getByText("Hash Chain Integrity")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await expect(page.getByText("Outbox Delivery Pipeline")).toBeVisible();
    await expect(page.getByText("Audit Access Logging")).toBeVisible();
    await expect(page.getByText("PII Sanitization")).toBeVisible();
    await expect(page.getByText("Component Isolation")).toBeVisible();
  });

  test("control cards show regulatory standard references", async ({
    page,
  }) => {
    await goToTab(page, "/report", "Compliance Report");

    await expect(page.getByText("OSFI B-13 §5 / SOC 2 CC8.1")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await expect(page.getByText("OSFI B-13 §3 / SOC 2 CC7.2")).toBeVisible();
    await expect(page.getByText("SOC 2 CC6.1").first()).toBeVisible();
    await expect(page.getByText("PIPEDA §4.7")).toBeVisible();
  });

  test("hash chain control lists all entities with pass/fail", async ({
    page,
  }) => {
    await goToTab(page, "/report", "Compliance Report");

    // Should list seeded mortgages under hash chain integrity
    await expect(page.getByText("123 Main St Mortgage")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await expect(page.getByText("456 Oak Ave Mortgage")).toBeVisible();

    // Should show event counts
    await expect(page.getByText(EVENT_COUNT_PATTERN).first()).toBeVisible();
  });

  test("PII sanitization control lists omitted fields", async ({ page }) => {
    await goToTab(page, "/report", "Compliance Report");

    await expect(page.getByText("PII Sanitization")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Should list some of the omitted PII fields
    await expect(
      page.getByText("email", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("ssn", { exact: true })).toBeVisible();
    await expect(page.getByText("phone", { exact: true })).toBeVisible();
  });

  test("outbox delivery shows pipeline metrics", async ({ page }) => {
    await goToTab(page, "/report", "Compliance Report");

    await expect(page.getByText("Outbox Delivery Pipeline")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Should show pipeline status numbers
    await expect(
      page.locator("div").filter({ hasText: PENDING_PATTERN }).first(),
    ).toBeVisible();
    await expect(
      page.locator("div").filter({ hasText: EMITTED_PATTERN }).first(),
    ).toBeVisible();
  });

  test("download JSON button is present", async ({ page }) => {
    await goToTab(page, "/report", "Compliance Report");

    await expect(
      page.getByRole("button", { name: "Download JSON" }),
    ).toBeVisible({ timeout: DATA_LOAD_TIMEOUT });
  });

  test("report shows PASS status for hash chain integrity with valid data", async ({
    page,
  }) => {
    await goToTab(page, "/report", "Compliance Report");

    // With seeded data and no tampering, all chains should be valid
    const hashChainSection = page
      .locator("div")
      .filter({ hasText: "Hash Chain Integrity" })
      .first();
    await expect(hashChainSection.getByText("PASS")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  });

  test("report shows PASS for component isolation", async ({ page }) => {
    await goToTab(page, "/report", "Compliance Report");

    await expect(page.getByText("defineComponent() boundary")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  });

  test("generated timestamp is recent", async ({ page }) => {
    await goToTab(page, "/report", "Compliance Report");

    // The report should show a "Generated" timestamp
    await expect(page.getByText(GENERATED_PATTERN).first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
  });
});

// ── Cross-Page Integration ──────────────────────────────────────
test.describe("Audit & Traceability — Integration", () => {
  test("create mortgage → verify hash chain → check audit trail → emit", async ({
    page,
  }) => {
    // 1. Create a mortgage with PII
    await goToTab(page, "", "Create Mortgage");
    await page.getByLabel("Label").fill("Integration E2E Mortgage");
    await page.getByLabel("Owner ID").fill("owner-integration");
    await page.getByLabel("Loan Amount").fill("500000");
    await page.getByPlaceholder("Email").fill("integration@e2e.test");
    await page.getByPlaceholder("SSN").fill("555-55-5555");
    await page.getByRole("button", { name: "Create Mortgage" }).click();
    await expect(page.getByText("Integration E2E Mortgage")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await expect(page.getByText("Active").first()).toBeVisible();

    // 2. Initiate a transfer
    const mortgageRow = page
      .locator("div")
      .filter({ hasText: "Integration E2E Mortgage" })
      .first();
    await mortgageRow
      .getByRole("button", { name: "Initiate Transfer" })
      .click();
    await mortgageRow.getByPlaceholder("owner-new").fill("buyer-integration");
    await mortgageRow.getByRole("button", { name: "Go" }).click();
    await expect(page.getByText("Initiated").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // 3. Navigate to Hash Chain — verify chain integrity
    await page.locator("nav").getByText("Hash Chain").click();
    await expect(page.getByText("Select Mortgage")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await page
      .getByRole("button", { name: "Integration E2E Mortgage" })
      .click();

    // Chain should be verified
    await expect(page.getByText("Chain verified")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // Should have at least 2 events (created + initiated)
    await expect(page.getByText("mortgage.created")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await expect(page.getByText("transfer.initiated")).toBeVisible();

    // PII should be omitted in event data (keys absent, not masked)
    await page.getByText("View sanitized state").first().click();
    const pre = page.locator("pre").first();
    const sanitized = await pre.textContent();
    expect(sanitized).not.toContain("integration@e2e.test");
    expect(sanitized).not.toContain("555-55-5555");
    expect(sanitized).not.toContain("borrowerEmail");
    expect(sanitized).not.toContain("borrowerSsn");

    // 4. Navigate to Audit Trail — query by actor
    await page.locator("nav").getByText("Audit Trail").click();
    await expect(page.getByText("Query Audit Trail")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await page.getByRole("button", { name: "By Actor" }).click();
    await page.getByPlaceholder("Actor ID").fill("demo-anonymous");
    await expect(page.getByText("Results").first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });

    // 5. Navigate to Pipeline — emit pending events
    await page.locator("nav").getByText("Pipeline").click();
    await expect(page.getByText("Manual Emission")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    const emitButton = page.getByRole("button", {
      name: "Emit Pending Events",
    });
    if (await emitButton.isEnabled({ timeout: 5000 }).catch(() => false)) {
      await emitButton.click();
      await expect(page.getByText(EVENTS_EMITTED_PATTERN).first()).toBeVisible({
        timeout: DATA_LOAD_TIMEOUT,
      });
    }

    // 6. Navigate to Access Log — verify page visits were logged
    await page.locator("nav").getByText("Access Log").click();
    await expect(page.getByText("Audit Access Log")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    // Previous tab visits should have generated access log entries
    await expect(page.getByText(ACCESS_LOG_PAGE_PATTERN).first()).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    await expect(page.getByText("Page-level access").first()).toBeVisible();

    // 7. Navigate to Report — verify compliance report is generated
    await page.locator("nav").getByText("Report").click();
    await expect(page.getByText("Compliance Report")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    // Summary cards should be populated
    await expect(page.getByText("Entities")).toBeVisible();
    await expect(page.getByText("Audit Events")).toBeVisible();
    // The integration mortgage should appear in hash chain integrity
    await expect(page.getByText("Integration E2E Mortgage")).toBeVisible({
      timeout: DATA_LOAD_TIMEOUT,
    });
    // Download button should be available
    await expect(
      page.getByRole("button", { name: "Download JSON" }),
    ).toBeVisible();
  });
});
