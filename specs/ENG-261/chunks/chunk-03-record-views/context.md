# ENG-261

## Verbatim Context

> 3. **View records in a table** rendered by the view engine (sortable, filterable)
> 8. **Toggle kanban view** on a select field to validate the view engine

> ### RecordTable (`src/components/demo/crm/RecordTable.tsx`)
> * Uses `@tanstack/react-table` + shadcn Table primitives
> * Column generation from viewDef's viewFields → fieldDef.fieldType → cell renderer
> * Cell renderers: text (truncated), number (formatted), currency ($X,XXX.XX), date (relative), boolean (check/X), select (colored badge), percentage (X.X%)
> * Sorting, global search (fuzzy via `@tanstack/match-sorter-utils`), pagination
> * Row click fires `onRowClick(record)` → opens RecordSidebar

> ### KanbanView (`src/components/demo/crm/KanbanView.tsx`)
> * Groups records by select field values
> * Columns = option values, cards show labelValue + key fields
> * Visual grouping only (no drag-drop needed for demo)

## API Surface

- `api.crm.viewDefs.listViews`
  args: `{ objectDefId }`
  returns default view first
- `api.crm.viewQueries.queryViewRecords`
  args: `{ viewDefId, cursor?, limit? }`
  supports `table` and `kanban`
- `api.crm.viewQueries.getViewSchema`
  args: `{ viewDefId }`
  returns `{ columns, viewType, needsRepair }`
- `api.crm.viewQueries.moveKanbanRecord`
  args: `{ recordId, viewDefId, targetGroupValue }`

## Codebase Reality

- The repo already contains a TanStack Table demo at `src/routes/demo/table.tsx`; reuse its basic table wiring pattern, not its page structure.
- `queryViewRecords` does not support calendar rendering.
- `queryViewRecords` is for EAV-backed objects. System-object table rendering must use `queryRecords` instead of view queries.
