# Chunk 06 Context — E2E Tests (Core Flows)

## Overview

Write Playwright e2e tests for the core governed transitions flows. Tests interact with the demo UI at `/demo/governed-transitions`.

## Test File Location

`tests/e2e/governed-transitions.spec.ts`

## Framework

Playwright — the project test framework per CLAUDE.md. Run with `bun test:e2e`.

Check existing e2e tests for patterns. Look at `tests/e2e/` directory for existing test files to follow conventions (imports, page navigation, assertions).

## Routes

- `/demo/governed-transitions` — Command Center (index page)
- `/demo/governed-transitions/journal` — Journal Viewer
- `/demo/governed-transitions/machine` — Machine Inspector

## UI Structure (Command Center)

### Create Entity Form (left column)
- Label input field
- Loan Amount input field (type=number)
- Applicant Name input field (optional)
- "Create Application" button

### Action Buttons (left column)
- "Seed Data" button
- "Run Full Lifecycle" button
- "Reset Demo" button

### Entity List (right column)
- Cards showing: label, status Badge, loan amount
- Clicking a card selects/expands it
- Selected card shows:
  - Valid transition buttons (green)
  - All event buttons (invalid ones gray/disabled)
  - Source channel selector (dropdown)

## Use Cases to Test

### UC-1: Create a Governed Entity
1. Navigate to `/demo/governed-transitions`
2. Fill in label (e.g., "Test Application") and loan amount (e.g., 100000)
3. Fill in applicant name (e.g., "Test User") — needed for SUBMIT guard later
4. Click "Create Application" button
5. Verify entity card appears with "draft" status badge

### UC-2: Send a Valid Command
1. Create entity with label, loan amount, and applicant name
2. Click/select the entity card
3. Click the "SUBMIT" transition button (should be valid from draft with complete data)
4. Verify status changes to "submitted"

### UC-3: Send an Invalid Command (Rejection)
1. Create entity (starts in "draft")
2. Select the entity
3. Click the "APPROVE" button (invalid from draft — shown as gray/disabled but still clickable)
4. Verify entity remains in "draft" state
5. Navigate to journal tab
6. Verify a rejection entry exists showing "APPROVE" event with outcome "rejected"

### UC-4: View Audit Journal
1. Click "Run Full Lifecycle" button (creates entity with 5 transitions)
2. Navigate to journal tab (`/demo/governed-transitions/journal`)
3. Verify at least 5 journal entries are visible
4. Verify event types include: SUBMIT, ASSIGN_REVIEWER, APPROVE, FUND, CLOSE

### UC-6: Walk Through Full Lifecycle
1. Navigate to `/demo/governed-transitions`
2. Click "Run Full Lifecycle" button
3. Verify an entity appears with "closed" status (terminal state)
4. Entity label should contain "Lifecycle Demo"

## Test Patterns

```typescript
import { test, expect } from "@playwright/test";

test.describe("Governed Transitions", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and reset
    await page.goto("/demo/governed-transitions");
    // Click reset button to ensure clean state
    // Wait for page to be ready
  });

  test("UC-1: create a governed entity", async ({ page }) => {
    // Fill form, click create, verify card appears
  });

  // ... etc
});
```

## Tips

- Use `page.getByRole()`, `page.getByText()`, `page.getByLabel()` for element selection
- Use `await expect(element).toBeVisible()` for visibility checks
- After mutations, wait for Convex reactivity — use `await expect(element).toBeVisible({ timeout: 5000 })` or similar
- Badge text content can be checked with `page.getByText("draft")` etc.
- For navigation to journal tab, click the "Journal" link in the nav tabs
