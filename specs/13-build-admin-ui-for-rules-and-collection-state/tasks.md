# 13. Build Admin UI for Rules and Collection State — Tasks

> Spec: https://www.notion.so/337fc1b440248137a4a1f11a164dae02
> Generated: 2026-04-05
>
> Execution sequencing update: all UI work from page 13 is intentionally deferred.
> If every non-deferred task below is checked, the local plan refactor and handoff
> work is complete. The unchecked deferred tasks remain backlog for dedicated
> end-of-sequence UI execution pages.

## Phase 1: Deferral & Handoff Refactor
- [x] T-001: Capture local PRD, design, and task artifacts for page 13. (F-1, F-2, F-3, F-4, F-5)
- [x] T-002: Re-fetch the live page-13 Notion spec and linked implementation plan, then ground the local plan against the current repo rather than older assumptions. (REQ-1, REQ-2, REQ-6, REQ-9, F-1, F-5)
- [x] T-003: Inventory the current admin shell, record-detail scaffolding, route structure, and page-12 backend surfaces so they are preserved as handoff context for the later UI phase. (REQ-2, REQ-6, REQ-9, F-1, F-3, F-5)
- [x] T-004: Re-scope the local page-13 plan so no route/component/UI test work starts in the current sequence and all UI work is deferred to dedicated end-loaded execution pages. (REQ-1, REQ-2, REQ-9, REQ-10, F-1, F-5)
- [x] T-005: Lock the future-state IA only as deferred handoff context: global rules/plan/attempt views, mortgage payments workspace, and governed action affordances. (REQ-1, REQ-6, REQ-8, REQ-9, F-1, F-4, F-5)

## Deferred UI Backlog — Do Not Execute In Current Sequence
- [ ] T-010: Add dedicated frontend query and mutation helpers/hooks for the page-12 collection admin surfaces. (REQ-2, REQ-7, REQ-9, F-2, F-3, F-4)
- [ ] T-011: Extend admin navigation and route wiring to expose first-class Rules, Collection Plan, and Collection Attempts areas. (REQ-3, REQ-4, REQ-5, REQ-9, F-1, F-2, F-3)
- [ ] T-012: Introduce shared status, lineage, reconciliation, and timeline presentation primitives for collection operations. (REQ-1, REQ-5, REQ-8, F-3, F-5)
- [ ] T-020: Build the Rules management list/detail UI using supported backend contracts. (REQ-2, REQ-3, REQ-8, F-2, F-5)
- [ ] T-021: Build the Collection Plan queue and plan-entry detail UI with lineage, balance gate, and execution context. (REQ-2, REQ-4, REQ-8, F-1, F-3, F-5)
- [ ] T-022: Build the Collection Attempts queue and attempt detail UI with transfer/reconciliation context. (REQ-2, REQ-5, REQ-8, F-1, F-3, F-5)
- [ ] T-023: Add the mortgage-centric payments workspace showing obligations, plan entries, attempts, and grouped timeline state. (REQ-1, REQ-6, REQ-8, REQ-9, F-1, F-5)
- [ ] T-030: Build manual execute UI flow with confirmation, result handling, and clear operator feedback. (REQ-2, REQ-7, REQ-8, F-4, F-5)
- [ ] T-031: Build reschedule UI flow with reason capture and visible lineage outcomes. (REQ-2, REQ-7, REQ-8, F-4, F-5)
- [ ] T-032: Build workout create/activate UI flow with clear mortgage-scoped context and safe confirmations. (REQ-2, REQ-7, REQ-8, F-4, F-5)
- [ ] T-033: Build rule create/update flows that preserve the typed rule contract and expose operator-facing outcomes. (REQ-2, REQ-3, REQ-7, REQ-8, F-2, F-4)
- [ ] T-040: Add route/component tests for the rules, plan, attempt, and mortgage-payments surfaces. (REQ-3, REQ-4, REQ-5, REQ-6, REQ-8, REQ-10, F-1, F-2, F-3, F-5)
- [ ] T-041: Add browser-observable coverage for the major operator journeys where product behavior is meaningfully exercised through the UI. (UC-1, UC-2, UC-3, UC-4, REQ-7, REQ-10, F-4, F-5)
- [ ] T-042: Run the relevant frontend/unit/e2e verification for page 13. (REQ-10)

## Future Closeout — Only When Dedicated UI Pages Are Activated
- [ ] T-050: Re-fetch the Notion spec and linked implementation plan after the deferred UI implementation to confirm the final code still matches the live page-13 contract. (F-1, F-2, F-3, F-4, F-5)
- [ ] T-051: Create `gap-analysis.md` after the deferred UI implementation is complete. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [ ] T-052: Present the final UI gap analysis to the user after the deferred UI implementation is complete. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [ ] T-053: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass after the deferred UI implementation is complete. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
