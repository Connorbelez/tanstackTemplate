# Chunk 01: Core Table Foundation

- [ ] T-001: Refactor `src/components/admin/shell/EntityTable.tsx` to remove the exported fake demo `columns`, redefine the generic prop contract, and add typed support for `title`, `description`, `isLoading`, `emptyState`, `newButtonSlot`, and `toolbarSlot`.
- [ ] T-002: Port the TanStack table behavior from `src/routes/demo/table.tsx` into `src/components/admin/shell/EntityTable.tsx`: fuzzy global filtering, sorting, pagination, column visibility, and reusable column metadata.
- [ ] T-003: Add accessible production table behavior in `src/components/admin/shell/EntityTable.tsx`: sortable headers with announced state, optional row-selection support, keyboard-safe row click handling, and distinct empty vs filtered-no-results states.
