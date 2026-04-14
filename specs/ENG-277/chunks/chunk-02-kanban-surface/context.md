# Chunk Context: chunk-02-kanban-surface

## Goal
- Build the shared production admin surface and controls that expose read-only kanban on top of the existing view-engine contracts.

## Relevant plan excerpts
- "Kanban availability must be offered only when an eligible single-select field exists, across native fields and typed EAV fields."
- "Kanban must remain visible but disabled with a clear explanation when the entity lacks an eligible field."
- "MVP production kanban must be read-only even though lower-level move mutations already exist."

## Implementation notes
- `src/components/demo/crm/RecordTableSurface.tsx` already shows the table/kanban orchestration pattern and lazy view creation flow.
- The demo surface is not production-ready because it picks the first `select` or `multi_select` field instead of using canonical eligibility metadata.
- `src/components/admin/shell/EntityTableToolbar.tsx` already has a view-toggle seam and should likely host the shared layout controls instead of inventing a separate toolbar.
- `convex/crm/viewQueries.ts:queryViewRecords` already dispatches to `queryKanbanView`.
- `convex/crm/entityAdapterRegistry.ts` and `convex/crm/viewState.ts` already expose supported layouts, defaults, and disabled-layout messages.

## Existing code touchpoints
- `src/components/admin/shell/EntityTableToolbar.tsx`
- `src/components/admin/shell/EntityTable.tsx`
- `src/components/demo/crm/RecordTableSurface.tsx`
- `src/components/demo/crm/ViewToggle.tsx`
- `convex/crm/viewQueries.ts`
- `convex/crm/viewDefs.ts`
- `convex/crm/viewState.ts`
- `convex/crm/entityAdapterRegistry.ts`
- `convex/crm/userSavedViews.ts`

## Validation
- A shared admin surface can switch between table and kanban using real view-engine state.
- Kanban controls are disabled with a reason when no eligible single-select field exists.
- The chosen layout and bound field survive reload through the canonical persistence path.
- The surface does not expose drag/drop or write mutations.
