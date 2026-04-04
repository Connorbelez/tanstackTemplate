# 03. Implement Collection Plan -> Collection Attempt Execution Spine — Tasks

> Spec: https://www.notion.so/337fc1b44024812291bac97a93ca6e10
> Generated: 2026-04-03
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer
- [x] T-001: Capture local PRD/design/tasks artifacts for the page-03 execution spine. (F-1, F-2, F-3, F-4, F-5, F-6)
- [x] T-002: Add or refine the due-entry discovery query path for bounded selection of due `planned` plan entries. (UC-1, REQ-1, REQ-2, F-1)
- [x] T-003: Add any minimal persistence or metadata support needed for runner observability and replay-safe batch execution. (REQ-1, REQ-3, REQ-6, F-1, F-6)

## Phase 2: Backend Functions
- [x] T-010: Run impact analysis on the shared page-02 execution surfaces and collection-attempt lifecycle symbols before modifying them. (REQ-2, REQ-5, REQ-8, F-2, F-4)
- [x] T-011: Implement a scheduler-owned due-entry runner action that executes due plan entries in bounded batches through `executePlanEntry`. (UC-1, REQ-1, REQ-2, REQ-3, F-1, F-2)
- [x] T-012: Wire the due-entry runner into `convex/crons.ts` with retry-safe scheduling semantics and basic execution observability. (UC-1, REQ-1, REQ-6, F-1, F-6)
- [x] T-013: Extend the production spine so successful `executePlanEntry` runs also initiate the downstream transfer through `initiateTransferInternal`. (UC-1, UC-2, UC-3, REQ-4, REQ-8, F-3)
- [x] T-014: Map transfer-initiation outcomes back onto `collectionAttempt` through GT transitions instead of direct status patches. (UC-2, UC-3, REQ-5, REQ-6, F-4)
- [x] T-015: Preserve retry-loop invariants so failure paths continue to create replacement plan entries rather than duplicate attempts from the same plan entry. (UC-3, REQ-7, F-5)
- [x] T-016: Audit and deprecate any older production collection-attempt creation or confirmation paths that bypass the canonical page-03 spine. (REQ-2, REQ-8, REQ-9, F-2, F-5)

## Phase 3: Frontend — Routes & Components
- [x] T-020: Verify whether this workstream can remain backend-only, or identify the minimum admin/manual wrapper work needed for later convergence on the same spine. (REQ-2, REQ-6, F-2)

## Phase 4: E2E Tests
- [x] T-030: Assess whether browser e2e coverage is applicable, given that the primary delivery surface is scheduler/backend orchestration. (REQ-10, F-6)
- [x] T-031: Add backend integration tests for due-entry discovery -> `executePlanEntry` -> transfer initiation -> Collection Attempt GT advancement. (UC-1, UC-2, REQ-1, REQ-2, REQ-4, REQ-5, REQ-10, F-1, F-3, F-4, F-6)
- [x] T-032: Add replay and cron-rerun tests proving one-attempt-per-plan-entry and replay-safe transfer initiation. (UC-1, REQ-3, REQ-10, F-2, F-6)
- [x] T-033: Add failure-path integration tests proving transfer-initiation failure stays durable on the attempt and continues to feed the retry loop. (UC-3, REQ-6, REQ-7, REQ-10, F-4, F-5, F-6)
- [x] T-034: Document why browser e2e is unnecessary if backend integration coverage fully exercises the production spine. (REQ-10, F-6)

## Phase 5: Verification
- [x] T-040: Re-fetch the Notion spec and linked implementation plan to verify the final code still matches the current contract and page-03 scope. (F-1, F-2, F-3, F-4, F-5, F-6)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
