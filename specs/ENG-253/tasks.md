# ENG-253: View Engine — Table & Kanban Rendering

## Master Task List

### Chunk 1: Export Shared Helpers + Create viewQueries Foundation
- [x] T-001: Export shared helpers from `recordQueries.ts`
- [x] T-002: Export shared helpers from `records.ts`
- [x] T-003: Create `convex/crm/viewQueries.ts` with `queryViewRecords` query
- [x] T-004: Implement `queryTableView` internal helper
- [x] T-005: Implement `queryKanbanView` internal helper
- [x] T-006: Add `getViewSchema` query

### Chunk 2: Kanban Mutation + OQ-1 Documentation + Quality Gate
- [x] T-007: Add `moveKanbanRecord` mutation
- [x] T-008: Document OQ-1 decision (client-side grouping for multi_select kanban v1)
- [x] T-009: Run `bun check`, `bun typecheck`, `bunx convex codegen` — all pass (pre-existing codegen errors only)
