# 13. Build Active Mortgage Payment System Demo Workspace (/demo) — Tasks

> Spec: https://www.notion.so/13-Build-Active-Mortgage-Payment-System-Demo-Workspace-demo-337fc1b440248137a4a1f11a164dae02?source=copy_link
> Generated: 2026-04-05
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer
- [x] T-001: Define the AMPS demo route contract, scenario model, and frontend view-model adapters around the existing collection admin surfaces from `convex/payments/collectionPlan/admin.ts`. (REQ-2, REQ-5, REQ-8, F-1, F-6)
- [x] T-002: Add any required demo-only seed/reset/query orchestration needed to provide deterministic AMPS scenarios without changing canonical payment-domain behavior. (REQ-5, REQ-7, F-5, F-6)
- [x] T-003: Wire shared data-loading and invalidation helpers for rules, plan entries, attempts, and mortgage operations summaries so the demo reads refresh cleanly after governed actions. (REQ-2, REQ-7, F-2, F-3, F-4)
- [x] T-004: Run project codegen/schema validation. (REQ-2)

## Phase 2: Backend Functions
- [x] T-010: Add any minimal demo-scoped backend read aggregation needed to compose the page-12 collection admin contracts for `/demo/amps` without expanding production admin IA. (REQ-1, REQ-2, REQ-6, F-1, F-4)
- [x] T-011: Add any minimal demo-scoped action wrappers for scenario setup or governed workflows while delegating real business effects to the canonical collection operations. (REQ-2, REQ-4, REQ-7, F-5, F-6)
- [x] T-012: Verify the demo can represent healthy, overdue, failed, retried, suppressed, review-required, and workout-backed stories from backend truth instead of ad hoc local state. (REQ-3, REQ-5, F-4, F-6)
- [x] T-013: Run project lint and type checks. (REQ-2, REQ-8)

## Phase 3: Frontend — Routes & Components
- [x] T-020: Create the `/demo/amps` workspace shell with navigation, scenario framing, and a command-center overview aligned with existing `/demo` route patterns. (UC-1, REQ-1, REQ-6, REQ-8, F-1)
- [x] T-021: Build the rules surface under `/demo/amps/rules`, including filters, summaries, and rule detail entry points. (UC-2, REQ-2, REQ-3, F-2)
- [x] T-022: Build the collection-plan surface under `/demo/amps/collection-plan`, emphasizing strategy, lineage, workout ownership, and balance pre-check state. (UC-2, REQ-3, REQ-5, F-3, F-6)
- [x] T-023: Build the collection-attempts surface under `/demo/amps/collection-attempts`, emphasizing execution history, transfers, reconciliation, and outcomes. (UC-2, REQ-3, REQ-5, F-3, F-6)
- [x] T-024: Build the mortgage-scoped payments workspace under `/demo/amps/mortgages/$mortgageId/payments` using the mortgage collection summary contract. (UC-3, REQ-2, REQ-3, REQ-5, F-4, F-6)
- [x] T-025: Add governed action dialogs/drawers for manual execute, reschedule, workout lifecycle actions, and rule create/update flows. (UC-4, REQ-4, F-5)
- [x] T-026: Ensure the demo clearly separates obligation truth, collection strategy, and execution history visually and textually across all views. (UC-2, UC-3, REQ-3, F-4)
- [x] T-027: Run project lint and type checks. (REQ-8)

## Phase 4: E2E Tests
- [x] T-030: Create e2e helpers and deterministic setup for the AMPS demo under `e2e/amps/`. (REQ-7, F-7)
- [x] T-031: Write e2e test for UC-1: open the AMPS workspace, navigate its tabs, and load a scenario-backed overview. (UC-1, REQ-1, REQ-7, F-1)
- [x] T-032: Write e2e test for UC-2: review rules, plan entries, and attempts while preserving the three-layer distinction. (UC-2, REQ-2, REQ-3, F-2, F-3)
- [x] T-033: Write e2e test for UC-3: inspect a mortgage payments workspace and verify scenario-backed status cues. (UC-3, REQ-3, REQ-5, F-4, F-6)
- [x] T-034: Write e2e test for UC-4: trigger governed demo actions such as manual execute, reschedule, workout actions, or rule update and verify refreshed backend-backed state. (UC-4, REQ-4, F-5)
- [ ] T-035: Write e2e tests for UC-5 and the story requirements covering healthy, overdue, retry, failed, suppressed, review-required, and workout-backed scenarios. (UC-5, REQ-5, REQ-7, F-6)
- [ ] T-036: Run e2e tests — all page-13 spec tests pass. (F-7)

## Phase 5: Verification
- [x] T-040: Re-fetch the Notion spec and linked implementation plan, then perform gap analysis against the final implementation. (REQ-1, REQ-2, REQ-5)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-5)
- [x] T-042: Present gap analysis to the user. (REQ-1, REQ-2, REQ-5)
- [x] T-043: Final lint, type check, codegen, and relevant test pass. (REQ-2, REQ-7, F-7)
