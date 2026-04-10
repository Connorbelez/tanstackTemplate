# 12. Add Admin Query and Mutation Surfaces for Collection Operations — Tasks

> Spec: https://www.notion.so/337fc1b440248119a4b9eb469e201b27
> Generated: 2026-04-05
>
> If every task below is checked, the spec is fully implemented, tested, and verified.

## Phase 1: Local Context & Contract Decisions
- [x] T-001: Capture local PRD, design, and task artifacts for page 12. (F-1, F-2, F-3, F-4, F-5)
- [x] T-002: Re-fetch the live page-12 Notion spec and linked implementation plan, then ground the local plan against current repo truth instead of older assumptions. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-8, F-1, F-2, F-5)
- [x] T-003: Inventory the current admin infrastructure (`convex/admin/queries.ts`, admin frontend entity contracts, fluent auth/permission builders) and the canonical collection-domain mutation seams that page 12 must wrap. (REQ-5, REQ-6, REQ-8, REQ-9, F-1, F-2, F-4, F-5)
- [x] T-004: Run impact analysis on the shared collection-plan and admin symbols before editing them, and record any GitNexus blind spots if the current index does not resolve the targets cleanly. (REQ-5, REQ-6, REQ-8, REQ-10, F-1, F-2, F-4)
- [x] T-005: Lock the page-12 backend contract boundary: dedicated collection-admin module versus generic entity-table extension, target read models, and the set of supported governed mutations. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-8, REQ-9, F-1, F-2, F-5)

## Phase 2: Admin Read Surfaces
- [x] T-010: Implement admin query surfaces for collection rules with typed rule summaries and operator-facing metadata. (REQ-1, REQ-7, REQ-8, F-1, F-3, F-5)
- [x] T-011: Implement admin query surfaces for collection plan entries with lineage, execution linkage, balance-gate, and workout-aware summaries. (REQ-2, REQ-4, REQ-7, REQ-8, F-1, F-3, F-5)
- [x] T-012: Implement admin query surfaces for collection attempts with transfer/reconciliation context and upstream plan-entry linkage. (REQ-3, REQ-7, REQ-8, F-1, F-3, F-5)
- [x] T-013: Implement a mortgage-scoped collection operations summary surface that combines the relevant rules, upcoming/recent entries, attempts, and active workout context for admin use. (REQ-4, REQ-7, REQ-8, F-1, F-3, F-5)

## Phase 3: Governed Admin Mutations
- [x] T-020: Implement admin mutation wrappers for supported collection operations by delegating to canonical domain seams rather than writing raw table mutations. (REQ-5, REQ-6, REQ-9, F-2, F-4)
- [x] T-021: Expose the supported manual execution action for plan entries through an admin surface that reuses the canonical execution API and preserves audit/reason metadata. (REQ-5, REQ-7, REQ-9, F-2, F-3, F-4)
- [x] T-022: Expose supported reschedule and workout operations through admin surfaces that reuse the canonical page-09/page-10 domain mutations and respect lifecycle guards. (REQ-5, REQ-7, REQ-9, F-2, F-3, F-4)
- [x] T-023: Expose supported rule-management mutations through admin surfaces only if they preserve the typed rule contract and governed status semantics. (REQ-1, REQ-5, REQ-6, REQ-9, F-2, F-4, F-5)

## Phase 4: Contracts, Permissions, and Tests
- [x] T-030: Ensure all collection-admin query and mutation surfaces use the shared backend auth/permission builders and return explicit contract shapes suitable for page 13 / page 16 consumption. (REQ-6, REQ-8, REQ-9, F-4, F-5)
- [x] T-031: Add backend contract tests for the admin read models covering rules, plan entries, attempts, and mortgage-scoped collection summaries. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-7, REQ-8, REQ-10, F-1, F-3, F-5)
- [x] T-032: Add backend mutation tests proving admin surfaces delegate to governed collection-domain operations and preserve lifecycle/audit invariants. (REQ-5, REQ-6, REQ-7, REQ-9, REQ-10, F-2, F-4)
- [x] T-033: Assess whether browser e2e adds value for page 12; default to backend coverage unless implementation forces minimal frontend integration work. (REQ-10, F-5)

## Phase 5: Verification & Closeout
- [x] T-040: Re-fetch the Notion spec and linked implementation plan after implementation to confirm the final code still matches the live page-12 contract. (F-1, F-2, F-3, F-4, F-5)
- [x] T-041: Create `gap-analysis.md`. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-042: Present the gap analysis to the user. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
- [x] T-043: Final `bun check`, `bun typecheck`, and `bunx convex codegen` pass. (REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10)
