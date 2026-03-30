# Chunk 1: Filter Operator Validation + View Defs CRUD

## Tasks
- [x] T-001: Create `convex/crm/filterOperatorValidation.ts` — pure functions mapping field types to valid operators
- [x] T-002: Create `convex/crm/viewDefs.ts` — `createView` mutation with capability validation + kanban group auto-creation + viewFields auto-population
- [x] T-003: `updateView` mutation — rename, rebind field (with capability re-validation and kanban group rebuild)
- [x] T-004: `deleteView` mutation — hard delete with default view protection, cascade delete children
- [x] T-005: `duplicateView` mutation — clone viewDef + all viewFields + viewFilters + viewKanbanGroups
- [x] T-006: `listViews` query — list viewDefs by objectDefId, default view first
- [x] T-007: `getView` query — single fetch with org verification
