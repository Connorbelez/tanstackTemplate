# 10. Implement Workout Plan Capability — Tasks

> Spec: https://www.notion.so/337fc1b4402481b59a5ecc19d8b22e13
> Generated: 2026-04-05
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer
- [x] T-001: Capture local PRD, design, and task artifacts for the page-10 workout-plan pass. (F-1, F-2, F-3, F-4, F-5, F-6)
- [x] T-002: Inventory the current collection-rule placeholder model, page-03 execution spine, page-09 reschedule seams, and any hardship-adjacent code that could conflict with page 10. (REQ-1, REQ-3, REQ-5, REQ-6, REQ-9, F-1, F-4)
- [x] T-003: Run impact analysis on the shared collection-plan schema, engine, scheduling, reschedule, and retry surfaces before editing them. If GitNexus cannot resolve the symbols cleanly, record that and compensate with focused regression coverage. (GitNexus could not resolve the targeted file/symbol lookups cleanly in the current index, so the pass was covered with focused regression tests plus final `detect_changes` review.) (REQ-4, REQ-5, REQ-6, REQ-10, F-1, F-3, F-4)
- [x] T-004: Add the explicit workout domain model and indexes needed for lifecycle, scope, and operator inspection. (REQ-1, REQ-2, REQ-7, F-1, F-2, F-5)
- [x] T-005: Expand collection-plan entry schema/source metadata so workout-owned strategy and lineage are auditable. (REQ-4, REQ-7, REQ-8, F-3, F-5)

## Phase 2: Backend Functions
- [x] T-010: Add canonical workout lifecycle mutations for create, activate, update, suspend, complete, and cancel flows as supported by the first version. (Shipped admin-first `create` + `activate` mutations and inspection queries for the page-10 scope; explicit update/suspend/complete/cancel flows remain downstream residual work.) (UC-1, UC-4, REQ-1, REQ-2, REQ-7, REQ-9, F-1, F-2, F-5)
- [x] T-011: Implement activation orchestration that rewrites covered future strategy into workout-owned plan entries without mutating obligations. (UC-1, UC-2, REQ-3, REQ-4, REQ-8, F-3)
- [x] T-012: Make initial scheduling and/or schedule-rule evaluation workout-aware so active workouts suppress competing default-schedule entries for covered obligations. (First-version coverage is activation-owned supersession plus workout-owned future entries; no separate schedule-rule extension was required for the shipped admin-first path.) (UC-2, REQ-4, REQ-6, F-3, F-4)
- [x] T-013: Lock explicit interaction rules for workout versus retry, borrower/admin reschedule, late fee, and operator overrides. (UC-3, REQ-6, F-4)
- [ ] T-014: Ensure workout exit behavior transitions future strategy predictably while leaving mortgage lifecycle logic obligation-driven. (UC-4, REQ-5, F-2, F-4)
- [x] T-015: Add operator inspection queries that expose current workout state, rationale, scope, and related plan-entry ownership for later page-12/page-13 surfaces. (REQ-2, REQ-7, F-5, F-6)

## Phase 3: Frontend — Routes & Components
- [x] T-020: Verify whether page 10 can remain backend/minimal-query focused and defer full operator UI to page 12 and page 13 while still satisfying auditability and inspectability requirements. (REQ-7, REQ-9, F-5, F-6)
- [x] T-021: Add only the minimum supported admin mutation/query exposure required if backend-only delivery would leave page-10 acceptance criteria unmet. (REQ-7, REQ-9, F-5, F-6)

## Phase 4: E2E Tests
- [x] T-030: Assess whether browser e2e adds value for page 10; default to backend contract and integration tests unless implementation forces UI work. (REQ-9, REQ-10, F-1, F-5, F-6)
- [x] T-031: Add contract tests for the workout domain model, lifecycle states, and workout-owned entry schema/source invariants. (REQ-1, REQ-2, REQ-8, REQ-10, F-1, F-2, F-5)
- [x] T-032: Add integration coverage proving workout activation changes future collection strategy while leaving obligations unchanged. (UC-1, UC-2, REQ-3, REQ-4, REQ-10, F-3)
- [x] T-033: Add regression coverage for explicit workout interaction rules with retry, reschedule, and late fee behavior. (UC-3, REQ-6, REQ-10, F-4)
- [ ] T-034: Add lifecycle-boundary coverage proving workout exit behavior remains predictable and mortgage delinquency/cure stay obligation-driven. (UC-4, REQ-5, REQ-10, F-2, F-4)

## Phase 5: Verification
- [x] T-040: Re-fetch the Notion spec and linked implementation plan to verify final code still matches the current page-10 contract. (F-1, F-2, F-3, F-4, F-5, F-6)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
