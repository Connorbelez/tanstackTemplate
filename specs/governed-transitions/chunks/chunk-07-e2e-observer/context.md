# Chunk 07 Context — E2E Tests (Observer Surfaces & Run All)

## Overview

Add e2e tests verifying the read-only observer rule on Journal and Machine routes, reactive updates across surfaces, and run all e2e tests to pass.

## Test File Location

Add tests to the existing `tests/e2e/governed-transitions.spec.ts` created in chunk-06.

## Routes

- `/demo/governed-transitions` — Command Center (ONLY mutative surface)
- `/demo/governed-transitions/journal` — Journal Viewer (READ-ONLY observer)
- `/demo/governed-transitions/machine` — Machine Inspector (READ-ONLY observer)

## Read-Only Observer Rule

The Journal and Machine tabs are presentation-only views:
- They may support inspection affordances: filtering, searching, row expansion, current-state highlighting
- They may NOT dispatch commands, mutate entity state, edit topology, add/remove nodes, or perform any destructive action
- All state changes originate from the Command Center

## T-045A: Journal Read-Only Verification

Test that the Journal page:
1. Navigate to `/demo/governed-transitions/journal`
2. Verify NO buttons with mutation-like text exist (no "Create", "Reset", "Seed", "Delete", "Submit", etc.)
3. Verify search/filter controls ARE present and functional
4. Verify clicking a journal entry expands it (inspection affordance OK)
5. Verify no elements with `data-testid` containing "command", "action", "mutation", or "submit" exist
6. Alternatively: count all `<button>` elements and verify none trigger mutations — they should only be filter/search UI controls

## T-045B: Machine Read-Only Verification

Test that the Machine page:
1. Navigate to `/demo/governed-transitions/machine`
2. Verify NO "Add Node" button exists
3. Verify NO drag interactions are available (if using the N8nWorkflowBlock wrapper, it should be in readOnly mode)
4. Verify the machine visualization IS present (state nodes, connections)
5. Verify the transition table IS present (data table with state/event info)
6. Verify no elements with mutation-like text exist

## T-045C: Reactive Updates Across Surfaces

Test that Command Center actions propagate to observer surfaces:

### Successful Transition Flow
1. Navigate to Command Center
2. Create an entity (or seed data)
3. Select entity, send valid transition (e.g., SUBMIT)
4. Navigate to Journal tab
5. Verify the new journal entry appears showing the SUBMIT transition with outcome "transitioned"
6. Navigate back to Command Center — entity shows updated status

### Rejected Transition Flow
1. Navigate to Command Center
2. Select an entity in "draft" state
3. Send an invalid event (e.g., APPROVE from draft)
4. Navigate to Journal tab
5. Verify a rejection entry appears showing APPROVE with outcome "rejected"

## T-045: Run All Tests

Run the full e2e test suite:
```bash
bun test:e2e
```

All governed-transitions e2e tests should pass. If any fail, fix the issues (could be in tests or in the application code).

## Test Patterns

```typescript
test("Journal page is read-only", async ({ page }) => {
  await page.goto("/demo/governed-transitions/journal");

  // Should NOT have mutation buttons
  await expect(page.getByRole("button", { name: /create|reset|seed|delete|submit/i })).toHaveCount(0);

  // SHOULD have filter/search controls
  await expect(page.getByPlaceholder(/search/i)).toBeVisible();
});

test("Machine page is read-only", async ({ page }) => {
  await page.goto("/demo/governed-transitions/machine");

  // Should NOT have "Add Node" button
  await expect(page.getByRole("button", { name: /add node/i })).toHaveCount(0);

  // SHOULD have state visualization
  // Check for state names in the diagram
  await expect(page.getByText("draft")).toBeVisible();
});
```
