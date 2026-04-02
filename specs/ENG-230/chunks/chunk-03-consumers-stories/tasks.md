# Chunk 03: Consumers + Stories + Gate

- [ ] T-007: Update `src/routes/admin/listings/route.tsx`, `src/routes/admin/mortgages/route.tsx`, and `src/routes/admin/$entitytype.tsx` to define local scaffold column defs and stop importing fake columns from the table component while preserving `onRowClick` + detail sheet behavior.
- [ ] T-008: Add Storybook stories for `src/components/admin/shell/EntityTable.tsx` covering default data, long-content truncation, loading, empty, no-results-after-filtering, sorting, filtering, pagination, row selection, column visibility, and narrow-width states.
- [ ] T-009: Add Storybook stories for `src/components/admin/shell/EntityTableToolbar.tsx` and each table-building renderer in `src/components/admin/shell/cell-renderers.tsx` with realistic fixtures and edge cases.
- [ ] T-010: Run `bun check`, `bun typecheck`, and `bunx convex codegen`; fix any regressions from this issue; then run `coderabbit review --plain` for a post-implementation review pass.
