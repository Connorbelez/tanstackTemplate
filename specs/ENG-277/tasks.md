# Tasks: ENG-277 - View Engine - Kanban Layout Builder

## Phase 1: Context And Shared View Resolution
- [x] T-001: Add a canonical admin view-engine context path that resolves `entityType` to object definition, system views, active saved view, supported layouts, and default board-driving field.
- [x] T-002: Replace the legacy admin list query hook path with view-engine-backed frontend query helpers and types.
- [x] T-003: Reconcile admin entity typing and route identity so fallback and dedicated routes use one consistent entity key set.

## Phase 2: Shared Admin Kanban Surface
- [x] T-004: Create a shared admin surface that can switch between table and kanban using the same resolved context and view-engine queries.
- [x] T-005: Create a read-only admin kanban view component that renders grouped records from the existing kanban query contract.
- [x] T-006: Extend toolbar or shared controls to show table/kanban mode, disabled-layout messaging, and board-field selection.
- [x] T-007: Persist selected layout and kanban bound field through the existing view definitions or saved-view overlay path.

## Phase 3: Route Migration And Coverage
- [x] T-008: Migrate in-scope admin routes away from `listEntityRows`, scaffold columns, and fake route-local table models to the shared surface.
- [x] T-009: Add or update backend and frontend tests for eligibility, disabled-state behavior, persistence, and dedicated-vs-fallback behavior.
- [x] T-010: Add or update Storybook coverage for reusable admin view controls or document why story coverage is not appropriate.
- [ ] T-011: Add or update e2e coverage for the operator workflow if the migrated admin route is testable in Playwright.
  Blocked by existing Convex deployment/codegen issues that prevent a trustworthy authenticated admin-route e2e run in this worktree.

## Phase 4: Validation
- [ ] T-012: Run `bun check`, `bun typecheck`, and `bunx convex codegen`.
  `bun check` and `bun typecheck` passed. `bunx convex codegen` is blocked by a pre-existing Convex module-analysis failure involving `convex/crm/__tests__/helpers.ts` and `@convex-dev/aggregate/src/test.ts`.
- [x] T-013: Run targeted tests for touched backend and frontend scope.
- [x] T-014: Run `gitnexus_detect_changes` and validate the change set against the execution checklist.
  GitNexus `detect_changes(scope=\"all\")` unexpectedly returned no changes even though `git status` shows the working tree diff; no stale-index warning was emitted.
