# Tasks: ENG-276 - View Engine — Relation Cells, Inline Expansion, and Cross-Entity Navigation

## Phase 1: Backend Relation Contract
- [ ] T-001: Add shared relation cell payload types to `convex/crm/types.ts` and update the row/cell model to carry typed relation values.
- [ ] T-002: Reuse or extract linked-record label/object resolution helpers so relation-backed view fields can hydrate consistent `recordId` / `recordKind` / `objectDefId` / `label` items.
- [ ] T-003: Update `convex/crm/viewQueries.ts` and any supporting helpers in `viewState.ts` / `recordQueries.ts` so table and kanban results emit cell-ready relation payloads while leaving calendar behavior unchanged.
- [ ] T-004: Add backend test coverage in `convex/crm/__tests__/viewEngine.test.ts` for relation hydration on at least one dedicated entity and one fallback entity.

## Phase 2: Shared Admin Relation UI
- [ ] T-005: Update frontend admin view result types to consume typed row/cell payloads instead of only `UnifiedRecord.fields`.
- [ ] T-006: Create a shared relation-cell component with collapsed truncation, inline expansion, and surface-owned single-open state.
- [ ] T-007: Add a shared relation navigation helper that prefers sidebar stack navigation and falls back to the correct dedicated or generic full-page route.
- [ ] T-008: Wire `AdminEntityTableView` and `AdminEntityKanbanView` to the new relation-cell rendering and navigation behavior without breaking row-click selection.
- [ ] T-009: Update generic detail rendering (`FieldRenderer` and any related detail helpers) so relation payloads render as relation UI rather than raw JSON.

## Phase 3: Validation And Regression Coverage
- [ ] T-010: Add frontend component/unit coverage for inline expansion, one-open-at-a-time behavior, and relation navigation fallback.
- [ ] T-011: Run `bun check`.
- [ ] T-012: Run `bun typecheck`.
- [ ] T-013: Run `bunx convex codegen`.
- [ ] T-014: Run targeted tests for touched backend and admin-shell scope.
- [ ] T-015: Reconcile the final change scope against the planned backend/frontend touchpoints using `git diff` plus the fallback caller sweep because GitNexus is unavailable.
