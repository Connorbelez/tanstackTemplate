# Chunk 06 — E2E Tests (Core Flows)

- [ ] T-040: Write e2e test for UC-1: Navigate to `/demo/governed-transitions`, fill in label and loan amount, click create, verify entity appears in list with "draft" status badge
- [ ] T-041: Write e2e test for UC-2: Create entity, select it, click a valid transition button (e.g. SUBMIT), verify status changes to "submitted"
- [ ] T-042: Write e2e test for UC-3: Create entity in "draft" state, attempt to send APPROVE (invalid from draft), verify entity remains in "draft", navigate to journal tab, verify rejection entry exists
- [ ] T-043: Write e2e test for UC-4: Run full lifecycle, navigate to journal tab, verify 5 journal entries visible with correct event types
- [ ] T-044: Write e2e test for UC-6: Click "Run Full Lifecycle" button, verify entity appears in "closed" state
