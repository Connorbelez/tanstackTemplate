# ENG-252: Chunk Manifest

| Chunk | Label | Tasks | Status |
|-------|-------|-------|--------|
| 01 | Filter Operator Validation + View Defs CRUD | T-001 — T-007 | complete |
| 02 | View Fields + View Filters + Kanban Groups | T-008 — T-018 | complete |
| QG | Quality Gate | T-019 — T-021 | complete |

## Execution Order
1. **chunk-01** creates the foundation: filterOperatorValidation.ts + viewDefs.ts (createView, updateView, deleteView, duplicateView, listViews, getView)
2. **chunk-02** creates child entity CRUD: viewFields.ts, viewFilters.ts, viewKanbanGroups.ts
3. **QG** runs quality checks after both chunks complete
