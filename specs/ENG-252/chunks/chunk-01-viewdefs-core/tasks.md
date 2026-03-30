# Chunk 1: Filter Operator Validation + View Defs CRUD

## Tasks
- [ ] T-001: Create `convex/crm/filterOperatorValidation.ts` — pure functions mapping field types to valid operators
- [ ] T-002: Create `convex/crm/viewDefs.ts` — `createView` mutation with capability validation + kanban group auto-creation + viewFields auto-population
- [ ] T-003: `updateView` mutation — rename, rebind field (with capability re-validation and kanban group rebuild)
- [ ] T-004: `deleteView` mutation — hard delete with default view protection, cascade delete children
- [ ] T-005: `duplicateView` mutation — clone viewDef + all viewFields + viewFilters + viewKanbanGroups
- [ ] T-006: `listViews` query — list viewDefs by objectDefId, default view first
- [ ] T-007: `getView` query — single fetch with org verification
