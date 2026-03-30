# ENG-252: View Definitions CRUD — Master Task List

## Chunk 1: Filter Operator Validation + View Defs CRUD
- [x] T-001: Create `convex/crm/filterOperatorValidation.ts` — pure functions mapping field types to valid operators
- [x] T-002: Create `convex/crm/viewDefs.ts` — `createView` mutation with capability validation + kanban group auto-creation + viewFields auto-population
- [x] T-003: `updateView` mutation — rename, rebind field (with capability re-validation and kanban group rebuild)
- [x] T-004: `deleteView` mutation — hard delete with default view protection, cascade delete children
- [x] T-005: `duplicateView` mutation — clone viewDef + all viewFields + viewFilters + viewKanbanGroups
- [x] T-006: `listViews` query — list viewDefs by objectDefId, default view first
- [x] T-007: `getView` query — single fetch with org verification

## Chunk 2: View Fields + View Filters + Kanban Groups CRUD
- [x] T-008: Create `convex/crm/viewFields.ts` — `setViewFieldVisibility` mutation
- [x] T-009: `reorderViewFields` mutation — update displayOrder from ordered fieldIds array
- [x] T-010: `setViewFieldWidth` mutation
- [x] T-011: `listViewFields` query — ordered by displayOrder
- [x] T-012: Create `convex/crm/viewFilters.ts` — `addViewFilter` mutation with operator-type validation
- [x] T-013: `updateViewFilter` mutation — validate operator changes against field type
- [x] T-014: `removeViewFilter` mutation — hard delete with org verification
- [x] T-015: `listViewFilters` query
- [x] T-016: Create `convex/crm/viewKanbanGroups.ts` — `reorderKanbanGroups` mutation
- [x] T-017: `toggleKanbanGroupCollapse` mutation
- [x] T-018: `listKanbanGroups` query — ordered by displayOrder

## Quality Gate
- [x] T-019: Run `bun check` — lint + format (passed)
- [x] T-020: Run `bun typecheck` — pre-existing env issues only (no tsc in PATH, no CONVEX_DEPLOYMENT); new file errors identical to existing CRM files
- [x] T-021: Run `bunx convex codegen` — same pre-existing env issue
