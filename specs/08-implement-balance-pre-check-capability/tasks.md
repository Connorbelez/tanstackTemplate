# 08. Implement Balance Pre-Check Capability — Tasks

> Spec: https://www.notion.so/337fc1b440248194a6e6dd923b82acc9
> Generated: 2026-04-04
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer
- [x] T-001: Capture local PRD, design, and task artifacts for the page-08 balance pre-check pass. (F-1, F-2, F-3, F-4, F-5)
- [x] T-002: Inventory the current page-03 execution spine, page-07 rule model, transfer failure metadata, and collection-plan visibility constraints that page 08 depends on. (REQ-1, REQ-3, REQ-6, REQ-7, REQ-8, F-1, F-2, F-4)
- [x] T-003: Run impact analysis on the shared execution, schema, runner, and rule surfaces before editing them. If GitNexus cannot resolve the symbols cleanly, record that and compensate with focused regression coverage. (REQ-1, REQ-4, REQ-5, F-2, F-3)
- [x] T-004: Replace the page-07 placeholder `BalancePreCheckRuleConfig` with a real typed decision contract. (REQ-1, REQ-4, REQ-8, F-1, F-5)
- [x] T-005: Expand `collectionPlanEntries` with balance-pre-check snapshot metadata sufficient for operator-visible gating and deferred visibility without mutating obligation truth. (REQ-2, REQ-6, REQ-7, F-2, F-3)
- [x] T-006: Update default-rule seeding and any helper fixtures so a canonical balance-pre-check rule can exist idempotently beside schedule/retry/late-fee rules. (REQ-4, REQ-8, F-1, F-5)

## Phase 2: Backend Functions
- [x] T-010: Add a dedicated balance pre-check evaluation seam in the Collection Plan domain, including signal loading and decision shaping. (UC-1, UC-2, UC-3, REQ-1, REQ-4, REQ-8, F-1, F-2)
- [x] T-011: Use a repo-grounded first-version signal source, preferably recent borrower/counterparty transfer failures such as `NSF` / `insufficient_funds`, rather than provider-side validation truth. (REQ-3, REQ-8, F-4, F-5)
- [x] T-012: Integrate the balance pre-check into canonical plan-entry execution before Collection Attempt creation. (UC-1, UC-2, UC-3, REQ-1, REQ-2, REQ-5, F-2)
- [x] T-013: Encode `defer`, `suppress`, and `require_operator_review` outcomes so blocked entries remain visible and do not silently disappear from AMPS state. (UC-2, UC-3, REQ-6, REQ-7, F-2, F-3)
- [x] T-014: Ensure due-runner selection and replay behavior respect balance-pre-check gating without creating duplicate attempts or thrashing blocked entries. (REQ-5, REQ-7, F-2)
- [x] T-015: Preserve the provider-boundary split so Payment Rails bank-account validation still runs separately for entries that proceed. (UC-4, REQ-3, F-4)

## Phase 3: Frontend — Routes & Components
- [x] T-020: Verify whether page 08 can stay backend-only and defer full operator UI to pages 12 and 13 while still persisting enough inspection data. (REQ-6, REQ-9, F-3)
- [x] T-021: Add only the minimum query or data-shape support required for later operator inspection if code review shows page 08 cannot satisfy the acceptance criteria with persistence alone. (REQ-6, REQ-9, F-3)

## Phase 4: E2E Tests
- [x] T-030: Assess whether browser e2e adds value for page 08; default to backend contract and integration tests unless implementation forces UI work. (REQ-9, REQ-10, F-2, F-3)
- [x] T-031: Add contract tests for the typed balance-pre-check rule config and seed behavior. (REQ-4, REQ-8, F-1, F-5)
- [x] T-032: Add execution tests proving `proceed` still creates one Collection Attempt and continues into Payment Rails validation separately. (UC-1, UC-4, REQ-3, REQ-5, REQ-10, F-2, F-4)
- [x] T-033: Add execution tests proving `defer` blocks attempt creation, persists a visible defer reason, and preserves obligation truth. (UC-2, REQ-2, REQ-5, REQ-6, REQ-7, REQ-10, F-2, F-3)
- [x] T-034: Add execution tests proving `suppress` and `require_operator_review` block attempt creation and persist machine-readable reasons. (UC-3, REQ-4, REQ-5, REQ-6, REQ-10, F-2, F-3)
- [x] T-035: Add runner/regression coverage proving blocked entries do not thrash and that page-03/page-07 behavior remains intact for unaffected rules. (REQ-5, REQ-7, REQ-10, F-2, F-5)

## Phase 5: Verification
- [x] T-040: Re-fetch the Notion spec and linked implementation plan to verify final code still matches the current page-08 contract. (F-1, F-2, F-3, F-4, F-5)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
