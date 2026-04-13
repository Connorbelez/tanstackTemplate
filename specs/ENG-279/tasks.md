# Tasks: ENG-279 - View Engine — Detail Sheet Renderer Registry, Editability, and Domain Sections

## Phase 1: Backend Detail Contract
- [x] T-001: Extract reusable normalized-detail field assembly from `convex/crm/viewState.ts`
- [x] T-002: Add a public detail-surface query in `convex/crm/recordQueries.ts`
- [x] T-003: Add or update backend tests for the new detail contract and computed/editability behavior

## Phase 2: Shared Frontend Wiring
- [x] T-004: Refactor `RecordSidebar.tsx` to consume the normalized detail-surface query
- [x] T-005: Expand `entity-view-adapters.tsx` into a section-based renderer registry with a generic fallback
- [x] T-006: Upgrade `FieldRenderer.tsx` for relation-aware and editability-aware rendering

## Phase 3: Dedicated Detail Sections
- [x] T-007: Add reusable detail-section primitives under `src/components/admin/shell/detail-sections/`
- [x] T-008: Implement the first dedicated detail modules for supported high-value entities
- [x] T-009: Demote or wrap `AdminDetailSheet.tsx` so it delegates to the canonical shared surface

## Phase 4: Verification
- [x] T-010: Add or update frontend tests for dedicated-vs-fallback renderer behavior and route-independent detail resolution
- [ ] T-011: Run `bun check`
  Blocked by existing repo-wide Biome violations outside ENG-279, including complexity warnings promoted by workspace policy and undeclared-variable errors in `convex/payments/collectionPlan/execution.ts`.
- [ ] T-012: Run `bun typecheck`
  Blocked by existing repo-wide TypeScript errors outside ENG-279 in `convex/payments/collectionPlan/execution.ts` and `convex/payments/webhooks/handleReversal.ts`.
- [ ] T-013: Run `bunx convex codegen`
  Blocked in this worktree because `CONVEX_DEPLOYMENT` is not configured locally.
- [x] T-014: Run targeted test commands for touched backend and admin-shell scope
- [x] T-015: Run `gitnexus_detect_changes` and reconcile the final change scope against the plan
  Note: `gitnexus_detect_changes({ scope: "all" })` returned `No changes detected`, so final scope reconciliation used `git status --short` and `git diff --stat` as the authoritative fallback.
