# 09. Implement Borrower Reschedule Capability — Tasks

> Spec: https://www.notion.so/337fc1b44024814f9c99ff923baa8ae7
> Generated: 2026-04-04
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer
- [x] T-001: Capture local PRD, design, and task artifacts for the page-09 borrower-reschedule pass. (F-1, F-2, F-3, F-4, F-5)
- [x] T-002: Inventory existing collection-plan schema scaffolding, retry lineage behavior, permission hints, and execution-state constraints relevant to page 09. (REQ-1, REQ-2, REQ-3, REQ-5, REQ-7, REQ-8, F-1, F-3, F-5)
- [x] T-003: Run impact analysis on the shared collection-plan schema, mutation, execution, runner, and retry surfaces before editing them. If GitNexus cannot resolve the symbols cleanly, record that and compensate with focused regression coverage. (REQ-2, REQ-5, REQ-7, REQ-10, F-1, F-4)
- [x] T-004: Finalize the canonical source/metadata model for reschedule-created entries, including any minimal schema additions needed for actor/reason attribution. (REQ-3, REQ-4, REQ-6, F-1, F-3, F-5)
- [x] T-005: Expand `collectionPlanEntries` schema or documented invariants so original-vs-replacement lineage is explicit and operator-inspectable. (REQ-3, REQ-4, REQ-6, F-2, F-3)

## Phase 2: Backend Functions
- [x] T-010: Add one canonical governed reschedule command in the Collection Plan domain. (UC-1, REQ-1, REQ-2, REQ-3, REQ-4, REQ-6, F-1, F-2, F-3)
- [x] T-011: Implement eligibility guards that reject executing, terminal, already-rescheduled, or otherwise ambiguous entries. (UC-2, REQ-2, REQ-9, F-1, F-4)
- [x] T-012: Mark the original entry `rescheduled` and create exactly one replacement `planned` entry with lineage back to the original. (UC-1, REQ-3, REQ-4, REQ-5, F-2, F-3)
- [x] T-013: Capture operator-visible reason and actor attribution for the reschedule event without mutating obligations or live execution facts. (REQ-1, REQ-6, REQ-9, F-2, F-3, F-5)
- [x] T-014: Ensure canonical execution and due-runner selection naturally skip superseded originals and later execute replacements normally. (UC-3, REQ-5, REQ-7, F-4)
- [x] T-015: Verify retry behavior stays unambiguous when a replacement entry later fails and spawns retry lineage. (UC-3, REQ-7, F-4)

## Phase 3: Frontend — Routes & Components
- [x] T-020: Verify page 09 can remain backend/admin-surface only and defer borrower UI delivery while still satisfying auditability and inspectability requirements. (REQ-6, REQ-8, F-3, F-5)
- [x] T-021: Add only the minimum query or admin surface support required if code review shows persistence alone is insufficient for the acceptance criteria. (REQ-6, REQ-8, F-3)

## Phase 4: E2E Tests
- [x] T-030: Assess whether browser e2e adds value for page 09; default to backend contract and integration tests unless implementation forces UI work. (REQ-8, REQ-10, F-1, F-3, F-4)
- [x] T-031: Add contract tests for the new reschedule command and any schema/source invariants it introduces. (REQ-3, REQ-4, REQ-6, REQ-10, F-1, F-3)
- [x] T-032: Add integration coverage for successful reschedule of an eligible future entry, proving obligation immutability and lineage correctness. (UC-1, REQ-1, REQ-3, REQ-4, REQ-10, F-2, F-3)
- [x] T-033: Add rejection coverage for executing, terminal, already-rescheduled, or otherwise ineligible entries. (UC-2, REQ-2, REQ-9, REQ-10, F-1, F-4)
- [x] T-034: Add regression coverage proving a replacement entry later executes through page-03 execution and page-07 retry flows without ambiguity. (UC-3, REQ-5, REQ-7, REQ-10, F-4)

## Phase 5: Verification
- [x] T-040: Re-fetch the Notion spec and linked implementation plan to verify final code still matches the current page-09 contract. (F-1, F-2, F-3, F-4, F-5)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
