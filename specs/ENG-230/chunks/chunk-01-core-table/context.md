# Chunk Context: core-table

Source: Linear `ENG-230`, Notion implementation plan + linked pages.
This file and the accompanying `tasks.md` contain everything needed to implement this chunk.

## Implementation Plan Excerpt
## 1. Goal
Refactor the current scaffolded admin table into a reusable production-grade `EntityTable<TData>` that can render CRM/native entity lists with rich admin UX: sorting, filtering, pagination, loading states, empty states, flexible toolbar controls, and pluggable cell renderers while staying fully entity-agnostic.

## 3. Requirements
### Acceptance Criteria
- [ ] `EntityTable<TData>` renders any entity type via column definitions
- [ ] Column sorting works (single column, toggle asc/desc/none)
- [ ] Global search filters across all text columns
- [ ] Pagination shows correct page info and navigates
- [ ] Row click fires `onRowClick(record)` callback
- [ ] All 7 cell renderer types work correctly
- [ ] Loading state shows skeleton rows
- [ ] Empty state shows when data is empty or filters match nothing
- [ ] Toolbar renders search, column visibility, filter pills
- [ ] Component is fully generic — no entity-specific assumptions baked in
- [ ] `bun check` and `bun typecheck` pass

### Derived Requirements
- The component must work with both plain row arrays and CRM-derived `UnifiedRecord` data without coupling to either fetch path.
- Entity-specific columns must live outside the table component; the table should not export demo columns.
- Toolbar controls and cell renderers should be split into modules so the admin UX can be rich without turning `EntityTable.tsx` into a monolith.
- Rich UX is in scope now: strong toolbar affordances, polished empty/loading states, good row interaction, and flexible renderer primitives should ship in this issue.
- This issue should not wait on a direct `Twenty.com` component port. It should reproduce the needed richness using the repo’s existing TanStack + shadcn primitives.
- The table should preserve the current `onRowClick` seam so ENG-231 can open the record sidebar from row selection.

## Architecture & Design
### File Map
- `src/components/admin/shell/EntityTable.tsx` — refactor — remove demo-only implementation and become the generic reusable core.
- `src/components/admin/shell/cell-renderers.tsx` — create — shared display renderers such as `TextCell`, `BadgeCell`, `CurrencyCell`, `DateCell`, `AvatarCell`, `PercentCell`, `LinkCell`, `SelectCell`, and `MultiSelectCell`.
- `src/components/admin/shell/EntityTableToolbar.tsx` — create — search, column visibility, filter chips, optional view toggle seam, and optional new-button slot.
- `src/routes/demo/table.tsx` — consume as reference only; no direct modifications required.
- `src/routes/admin/*/route.tsx` — later consumers; keep compatibility with `onRowClick`.

### Key Design Decisions
1. Keep the table as a presentational stateful component, not a data-fetching component. Fetching stays in routes/hooks.
2. Remove the exported demo `columns` from `EntityTable.tsx` so no route accidentally treats scaffold data as production API.
3. Build rich admin UX now from native repo primitives rather than delaying for a future component port.
4. Split toolbar and cell renderers into dedicated modules to support a richer surface area without coupling the core table to every renderer detail.
5. Stay compatible with CRM view contracts from `getViewSchema`, but do not hardcode CRM-specific assumptions into the table core.

### Data Structures
```typescript
export interface EntityTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  title?: string;
  description?: string;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  newButtonSlot?: React.ReactNode;
  toolbarSlot?: React.ReactNode;
}

export interface EntityTableColumnMeta {
  align?: "left" | "center" | "right";
  isTextSearchable?: boolean;
  label?: string;
  isHideable?: boolean;
  width?: number;
}
```

## Current Repo Drift
### Contradictions Found
- **Pre-ENG-230 baseline: `EntityTable.tsx` started as scaffold code**.
  - **Impact at baseline:** it exported fake `columns` for `{ id, name, amount }`, only used `getCoreRowModel`, and did not satisfy the issue scope.
  - **Outcome in this branch:** the scaffold export was removed and routes now provide local column definitions.
- **Admin routes were fake-data consumers at the start of the chunk**.
  - **Impact at baseline:** the table could not be validated against real entity rows yet without additional route work.
  - **Current state:** route consumers now own their column definitions, but several routes still use scaffold-friendly data sources while the CRM-backed view engine rollout continues.

### Confirmed Alignments
- `src/routes/demo/table.tsx` already demonstrates TanStack sorting, fuzzy filtering, and pagination patterns worth lifting into the production table.
- `convex/crm/viewQueries.ts` already exists and exposes the schema/data queries the admin shell needs.
- The repo already has shared UI primitives for tables, dropdown menus, skeletons, pagination, and empty states.

## CRM / View Engine Contract
**ENG-253**: already implemented on main and exposes `queryViewRecords`, `getViewSchema`, and `moveKanbanRecord`.

`convex/crm/types.ts`
```typescript
export interface UnifiedRecord {
  _id: string;
  _kind: "record" | "native";
  createdAt: number;
  fields: Record<string, unknown>;
  objectDefId: Id<"objectDefs">;
  updatedAt: number;
}
```

`convex/crm/viewQueries.ts`
```typescript
interface ColumnDef {
  displayOrder: number;
  fieldDefId: Id<"fieldDefs">;
  fieldType: FieldDef["fieldType"];
  isVisible: boolean;
  label: string;
  name: string;
  width: number | undefined;
}

interface TableViewResult {
  columns: ColumnDef[];
  cursor: string | null;
  rows: UnifiedRecord[];
  totalCount: number;
}

interface ViewSchemaResult {
  columns: ViewSchemaColumn[];
  needsRepair: boolean;
  viewType: "table" | "kanban" | "calendar";
}
```

## In-Repo Reference Patterns
`src/routes/demo/table.tsx`
```typescript
const table = useReactTable({
  data,
  columns,
  filterFns: {
    fuzzy: fuzzyFilter,
  },
  state: {
    columnFilters,
    globalFilter,
  },
  onColumnFiltersChange: setColumnFilters,
  onGlobalFilterChange: setGlobalFilter,
  globalFilterFn: "fuzzy",
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
});
```

`src/components/admin/shell/EntityTable.tsx`
```typescript
export default function EntityTable<TData>({
  columns,
  data,
  onRowClick,
}: EntityTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    filterFns: {
      fuzzy: (row, columnId, value, addMeta) => {
        const itemRank = rankItem(row.getValue(columnId), value);
        addMeta({ itemRank });
        return itemRank.passed;
      },
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
}
```

## Constraints & Rules
- Do not bake entity-specific assumptions into the core table.
- Do not treat future `Twenty.com` component ports as a prerequisite for rich UX here.
- Keep renderers loosely coupled so future editing behaviors can wrap or replace them later.
- Avoid `any` in column metadata and generic props.
- CRM integration already exists on the backend, but the table should still work with plain array data for local/demo routes.

## File Structure
- Core refactor lives in `src/components/admin/shell/EntityTable.tsx`.
- Supporting modules are separate files in the same `src/components/admin/shell/` directory.
- Downstream admin route consumers must supply their own column definitions from route- or entity-specific modules.
