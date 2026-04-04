# 06. Correct Activation and Initial Scheduling Handoff — Tasks

> Spec: https://www.notion.so/337fc1b4402481738c5ecc14f4e08da9
> Generated: 2026-04-04
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer
- [x] T-001: Capture local PRD, design, and task artifacts for the page-06 activation/scheduling handoff pass. (F-1, F-2, F-3, F-4, F-5, F-6)
- [x] T-002: Inventory the current bootstrap, obligation-generation, rules-engine, and rule-seeding call sites that participate in initial schedule creation. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-6, F-1, F-2, F-3)
- [x] T-003: Lock the shared orchestration design for canonical initial scheduling without introducing new schema. (REQ-2, REQ-3, REQ-4, REQ-7, F-2, F-4, F-5)

## Phase 2: Backend Functions
- [x] T-010: Run impact analysis on the shared scheduling, bootstrap, and obligation-generation surfaces before editing them. (REQ-2, REQ-3, REQ-4, REQ-8, F-2, F-3, F-6)
- [x] T-011: Extract or introduce a shared initial-scheduling orchestration seam that embodies schedule-rule semantics and can be called from both rule evaluation and bootstrap/activation flows. (UC-1, REQ-2, REQ-3, REQ-4, F-2, F-4)
- [x] T-012: Refactor `scheduleRule` handling to delegate to the shared canonical initial-scheduling seam instead of owning a private implementation path. (UC-1, REQ-2, REQ-4, F-2, F-4)
- [x] T-013: Refactor `seedPaymentData` so it generates or reuses obligations first and then invokes canonical initial scheduling instead of directly inserting initial `collectionPlanEntries`. (UC-1, REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, F-1, F-2, F-3, F-4)
- [x] T-014: Ensure bootstrap/activation prerequisites seed or verify default collection rules before canonical initial scheduling runs. (UC-1, REQ-3, REQ-6, F-2, F-3)
- [x] T-015: Preserve rerun safety so bootstrap, repair, or activation-style re-entry does not duplicate initial plan entries. (UC-2, REQ-4, REQ-7, F-5)
- [x] T-016: Verify that page-03 execution and page-07 follow-on rules consume canonical initial entries without special-case handling. (UC-3, REQ-8, F-6)

## Phase 3: Frontend — Routes & Components
- [x] T-020: Verify that page 06 remains backend orchestration work with no route or UI changes required. (REQ-5, F-1, F-3)

## Phase 4: E2E Tests
- [x] T-030: Assess whether browser e2e adds value for this backend activation/bootstrap orchestration change. (REQ-9, F-6)
- [x] T-031: Add or extend backend tests for the shared initial-scheduling seam and schedule-rule delegation. (UC-1, REQ-2, REQ-4, REQ-7, F-2, F-4, F-5)
- [x] T-032: Add integration coverage proving bootstrap/activation-style orchestration creates obligations first and initial plan entries second through the canonical path. (UC-1, REQ-1, REQ-2, REQ-3, REQ-5, REQ-6, F-1, F-2, F-3, F-4)
- [x] T-033: Add rerun/idempotency coverage proving repeated bootstrap or repair execution does not duplicate initial entries. (UC-2, REQ-4, REQ-7, F-5)
- [x] T-034: Add downstream compatibility coverage for page-03 execution and page-07 rule behavior against canonical initial entries. (UC-3, REQ-8, F-6)

## Phase 5: Verification
- [x] T-040: Re-fetch the Notion spec and linked implementation plan to verify final code still matches the current page-06 contract. (F-1, F-2, F-3, F-4, F-5, F-6)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9)
