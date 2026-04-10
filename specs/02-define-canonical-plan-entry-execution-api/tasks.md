# 02. Define Canonical Plan Entry Execution API — Tasks

> Spec: https://www.notion.so/337fc1b440248115b4d3c21577f27601
> Generated: 2026-04-03
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer
- [x] T-001: Capture local PRD/design/tasks artifacts for the canonical execution contract. (F-1, F-2, F-3, F-4, F-5)
- [x] T-002: Add the minimum `collectionPlanEntries` execution-linkage fields required for replay-safe plan-entry consumption. (REQ-3, REQ-4, REQ-7, F-3)
- [x] T-003: Add the minimum `collectionAttempts` execution-context and transfer-linkage fields required for downstream traceability. (REQ-4, REQ-5, REQ-7, F-4)

## Phase 2: Backend Functions
- [x] T-010: Add shared execution contract types, validators, outcome taxonomy, and reason codes. (REQ-2, REQ-3, REQ-5, F-2, F-3, F-4)
- [x] T-011: Implement eligibility and replay guards for canonical plan-entry execution. (UC-2, UC-3, REQ-3, REQ-4, F-3)
- [x] T-012: Implement the internal `executePlanEntry` command using the canonical contract. (UC-1, UC-2, UC-3, REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, F-1, F-2, F-3, F-4)
- [x] T-013: Make the AMPS -> Payment Rails handoff explicit through transfer-request creation without direct `TransferProvider` usage. (UC-1, REQ-4, REQ-5, REQ-6, F-4)

## Phase 3: Frontend — Routes & Components
- [x] T-020: Verify this issue requires no new frontend routes or components because it ships an internal-first contract only. (REQ-1, REQ-5)

## Phase 4: E2E Tests
- [x] T-030: Assess whether browser/e2e coverage is applicable for this internal contract workstream. (REQ-8, F-5)
- [x] T-031: Add contract-focused backend tests for `attempt_created`, `already_executed`, `not_eligible`, `rejected`, and handoff-failure preservation. (UC-1, UC-2, UC-3, REQ-3, REQ-4, REQ-8, F-5)
- [x] T-032: Document why browser e2e coverage is not required if backend integration coverage is sufficient for this issue. (REQ-8, F-5)

## Phase 5: Verification
- [x] T-040: Re-fetch the Notion spec and linked implementation plan to confirm the final code still matches the current contract. (F-1, F-2, F-3, F-4, F-5)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8)
