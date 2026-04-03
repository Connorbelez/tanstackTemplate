# Tasks: ENG-230 — Admin Shell — EntityTable (Reusable Data Table)

Source: Linear `ENG-230`, Notion implementation plan, linked context pages, and current repo state
Generated: 2026-04-02

## Phase 1: Core Table Foundation
- [ ] T-001: Refactor [EntityTable.tsx](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/components/admin/shell/EntityTable.tsx) to remove the exported fake demo `columns`, redefine the generic prop contract, and add typed support for `title`, `description`, `isLoading`, `emptyState`, `newButtonSlot`, and `toolbarSlot`.
- [ ] T-002: Port the TanStack table behavior from [table.tsx](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/routes/demo/table.tsx) into [EntityTable.tsx](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/components/admin/shell/EntityTable.tsx): fuzzy global filtering, sorting, pagination, column visibility, and reusable column metadata.
- [ ] T-003: Add accessible production table behavior in [EntityTable.tsx](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/components/admin/shell/EntityTable.tsx): sortable headers with announced state, optional row-selection support, keyboard-safe row click handling, and distinct empty vs filtered-no-results states.

## Phase 2: Supporting Admin Table Modules
- [ ] T-004: Create [EntityTableToolbar.tsx](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/components/admin/shell/EntityTableToolbar.tsx) with debounced global search, column visibility controls, active filter pills, an optional table/kanban toggle seam, and an optional `newButtonSlot`.
- [ ] T-005: Create [cell-renderers.tsx](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/components/admin/shell/cell-renderers.tsx) with shared `TextCell`, `ImageCell`, `BadgeCell`, `CurrencyCell`, `DateCell`, `AvatarCell`, `PercentCell`, `LinkCell`, `MultiSelectCell`, and `SelectCell` helpers.
- [ ] T-006: Wire the toolbar, skeleton rows, empty states, pagination UI, and renderer/column metadata into [EntityTable.tsx](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/components/admin/shell/EntityTable.tsx) without adding entity-specific assumptions.

## Phase 3: Consumer Validation, Storybook, and Gate
- [ ] T-007: Update [listings route](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/routes/admin/listings/route.tsx), [mortgages route](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/routes/admin/mortgages/route.tsx), and [dynamic entity route](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/routes/admin/$entitytype.tsx) to define local scaffold column defs and stop importing fake columns from the table component while preserving `onRowClick` + detail sheet behavior.
- [ ] T-008: Add Storybook stories for [EntityTable](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/components/admin/shell/EntityTable.tsx) covering default data, long-content truncation, loading, empty, no-results-after-filtering, sorting, filtering, pagination, row selection, column visibility, and narrow-width states.
- [ ] T-009: Add Storybook stories for [EntityTableToolbar](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/components/admin/shell/EntityTableToolbar.tsx) and each table-building renderer in [cell-renderers.tsx](/Users/connor/.t3/worktrees/fairlendapp/t3code-35e1a6e1/src/components/admin/shell/cell-renderers.tsx) with realistic fixtures and edge cases.
- [ ] T-010: Run `bun check`, `bun typecheck`, and `bunx convex codegen`; fix any regressions from this issue; then run `coderabbit review --plain` for a post-implementation review pass.
