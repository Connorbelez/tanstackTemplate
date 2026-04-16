# Tasks: ENG-280 - View Engine — Dedicated Entity Adapter Rollout for Listings, Mortgages, Obligations, and Borrowers

## Phase 1: Native Listings And Curated Views
- [ ] T-001: Add listings to `convex/crm/systemAdapters/bootstrap.ts` with the minimum native fields, relation metadata, and default table-view bootstrap required by the shared view engine.
- [ ] T-002: Extend `convex/crm/systemAdapters/queryAdapter.ts` so listings support native pagination and get-by-id through the shared CRM adapter path.
- [ ] T-003: Add or update a system-view seeding or repair path so listings, mortgages, obligations, and borrowers receive curated default view definitions and aggregate presets idempotently.

## Phase 2: Dedicated Adapter Hydration And Row Semantics
- [ ] T-004: Expand `convex/crm/entityAdapterRegistry.ts` with richer dedicated definitions for listings, mortgages, obligations, and borrowers, including title/status candidates, preferred visible fields, and any necessary field overrides.
- [ ] T-005: Extend the dedicated-field contract in `convex/crm/types.ts` and `convex/crm/entityViewFields.ts` so adapter-driven summary or computed fields can carry the metadata needed for relation-aware display where required.
- [ ] T-006: Add batched dedicated hydration in `convex/crm/viewQueries.ts`, `convex/crm/recordQueries.ts`, and supporting helpers so list, kanban, and detail queries receive entity-specific summary data without per-row N+1 behavior.
- [ ] T-007: Make shared row and card headers adapter-aware in `src/components/admin/shell/admin-view-rendering.tsx`, `AdminEntityTableView.tsx`, and `AdminEntityKanbanView.tsx`.

## Phase 3: Dedicated Detail Modules
- [ ] T-008: Expand the frontend dedicated renderer registry in `src/components/admin/shell/entity-view-adapters.tsx` for listings, mortgages, obligations, and borrowers.
- [ ] T-009: Add reusable dedicated detail section modules for the rollout entities, reusing existing shared section primitives and existing listing-domain queries where available.
- [ ] T-010: Keep fallback entities and generic detail rendering intact while routing rollout entities through the new dedicated section modules.

## Phase 4: Verification
- [ ] T-011: Add or update backend tests for native listings bootstrap/query support, curated system views, and dedicated hydration.
- [ ] T-012: Add or update admin-shell tests for dedicated row semantics and at least one dedicated detail renderer path.
- [ ] T-013: Run `bun check`.
- [ ] T-014: Run `bun typecheck`.
- [ ] T-015: Run `bunx convex codegen`.
- [ ] T-016: Run targeted test commands for the touched CRM/admin-shell scope.
- [ ] T-017: Reconcile the final diff against the planned touchpoints using `git diff` and caller/import sweeps because GitNexus is unavailable.
