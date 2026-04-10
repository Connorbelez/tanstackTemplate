# 07. Expand Collection Rule Model and Complete Retry/Late-Fee Behaviors — Tasks

> Spec: https://www.notion.so/337fc1b440248176af0ec126b8aac764
> Generated: 2026-04-04
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Schema & Data Layer
- [x] T-001: Capture local PRD, design, and task artifacts for the page-07 typed collection-rule pass. (F-1, F-2, F-3, F-4)
- [x] T-002: Inventory the current `collectionRules` schema, engine dispatch, rule handlers, seed helpers, and downstream dependency surfaces for schedule/retry/late-fee behavior. (REQ-1, REQ-2, REQ-5, REQ-8, F-1, F-2, F-3)
- [x] T-003: Lock the typed rule-envelope and typed rule-config design, including future extension placeholders, without over-building page-08/09/10 behavior. (REQ-2, REQ-3, REQ-4, REQ-7, F-1, F-4)
- [x] T-004: Run impact analysis on the shared schema, engine, seed, and rule surfaces before editing them. If GitNexus cannot resolve symbols cleanly, record that and compensate with focused regression coverage. (REQ-1, REQ-2, REQ-5, F-1, F-2, F-3)
- [x] T-005: Expand the `collectionRules` schema and validators to support explicit rule kind, admin-operable metadata, typed config, deterministic status/effective-window semantics, and future extension points. (REQ-2, REQ-3, REQ-4, REQ-5, F-1, F-3, F-4)
- [x] T-006: Update default-rule seeding and test seed helpers to emit the canonical typed rule representation idempotently. (REQ-1, REQ-6, F-1, F-2)

## Phase 2: Backend Functions
- [x] T-010: Refactor the collection rule engine to dispatch by explicit rule kind rather than freeform `name`. (UC-1, UC-2, UC-3, REQ-2, REQ-5, F-1, F-3)
- [x] T-011: Preserve schedule-rule behavior while migrating it to the typed rule config contract. (UC-1, REQ-1, REQ-2, REQ-5, F-2)
- [x] T-012: Preserve retry-rule behavior while migrating it to the typed rule config contract and keeping retry lineage/idempotency intact. (UC-2, REQ-1, REQ-2, REQ-5, REQ-6, F-2, F-3)
- [x] T-013: Preserve late-fee-rule behavior while migrating it to the typed rule contract and keeping mortgage-fee resolution authoritative. (UC-3, REQ-1, REQ-2, REQ-8, F-2)
- [x] T-014: Add shared rule selection and matching helpers for active status, effective window, scope, and deterministic ordering. (REQ-3, REQ-5, REQ-7, F-1, F-3)
- [x] T-015: Ensure the typed rule model and engine registry are ready for future balance pre-check, reschedule, and workout rule kinds without implementing those behaviors here. (UC-4, REQ-4, F-4)
- [x] T-016: Verify the page-06 activation handoff and page-03 execution spine still consume schedule/retry/late-fee outcomes without special-case regressions. (REQ-1, REQ-5, REQ-7, F-2, F-3)

## Phase 3: Frontend — Routes & Components
- [x] T-020: Verify that page 07 remains backend model/engine work and that admin UI/query surfaces can stay deferred to page 12. (REQ-3, REQ-9, F-4)

## Phase 4: E2E Tests
- [x] T-030: Assess whether browser e2e adds value for this backend rule-model refactor; default to backend integration and contract tests unless code inspection proves otherwise. (REQ-1, REQ-9, F-2, F-3)
- [x] T-031: Add or extend contract tests for the typed collection-rule schema, default seeds, and engine dispatch. (REQ-2, REQ-3, REQ-5, REQ-6, F-1, F-3)
- [x] T-032: Add regression coverage proving schedule-rule behavior is preserved under the typed model. (UC-1, REQ-1, REQ-2, REQ-5, F-2)
- [x] T-033: Add regression coverage proving retry-rule behavior remains correct, idempotent, and lineage-preserving under the typed model. (UC-2, REQ-1, REQ-2, REQ-5, REQ-6, F-2, F-3)
- [x] T-034: Add regression coverage proving late-fee behavior remains correct and idempotent under the typed model. (UC-3, REQ-1, REQ-2, REQ-8, F-2)
- [x] T-035: Add coverage for deterministic enablement, priority, effective-window, and future-extension semantics in the typed rule system. (UC-4, REQ-4, REQ-5, F-3, F-4)

## Phase 5: Verification
- [x] T-040: Re-fetch the Notion spec and linked implementation plan to verify final code still matches the current page-07 contract. (F-1, F-2, F-3, F-4)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9)
