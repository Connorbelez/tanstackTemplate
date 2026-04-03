# Chunk Context: consumers-stories

Source: Linear `ENG-230`, Notion implementation plan + linked pages.
This file and the accompanying `tasks.md` contain everything needed to implement this chunk.

## Current Consumer Drift
`src/routes/admin/listings/route.tsx`
```typescript
import type { ColumnDef } from "@tanstack/react-table";
import EntityTable from "#/components/admin/shell/EntityTable.tsx";

const columns: ColumnDef<ListingTableRow>[] = [/* route-local listing columns */];

return (
  <EntityTable
    columns={columns}
    data={fakeData}
    onRowClick={(row) => open(String(row.id))}
  />
);
```

`src/routes/admin/mortgages/route.tsx`
```typescript
import type { ColumnDef } from "@tanstack/react-table";
import EntityTable from "#/components/admin/shell/EntityTable.tsx";

const columns: ColumnDef<MortgageTableRow>[] = [/* route-local mortgage columns */];

return (
  <>
    <EntityTable
      columns={columns}
      data={fakeData}
      onRowClick={(row) => open(String(row.id))}
    />
    <AdminDetailSheet entityType="mortgages" />
  </>
);
```

`src/routes/admin/$entitytype.tsx`
```typescript
import type { ColumnDef } from "@tanstack/react-table";
import EntityTable from "#/components/admin/shell/EntityTable.tsx";

const columns: ColumnDef<DynamicEntityRow>[] = [/* route-local dynamic columns */];

return (
  <>
    <EntityTable
      columns={columns}
      data={fakeData}
      onRowClick={(row) => open(String(row.id))}
    />
    <AdminDetailSheet entityType={entitytype} />
  </>
);
```

## Implementation Plan Excerpt
### Step 6: Prove the component with route-level consumers
- **Files:** current admin entity routes as consumers
- **Action:** Consumer validation.
- **Details:** Update one or more scaffold routes to pass real column definitions instead of importing demo columns. Preserve `onRowClick` behavior for ENG-231.
- **Validation:** A route renders the generic table without importing fake columns from the table file.

## Linked Dependency Context
### ENG-228 Downstream Contract
- **ENG-230**: Needs the registry for titles, routes, and shell-level integration.
- **ENG-231**: Needs the registry for entity icons, routes, and sidebar navigation context.
- **ENG-232**: Needs the registry to resolve dynamic entity detail pages and breadcrumbs.

### ENG-241 Consumer Expectation
Build the listing management screen using the admin shell components: EntityTable for list view, RecordSidebar for record detail, and EntityPage for full detail view.

### Table View (default)
* Uses `EntityTable` ([ENG-230](https://linear.app/fairlend/issue/ENG-230/admin-shell-entitytable-reusable-data-table)) with listing-specific columns:
  * Title (TextCell), Status (BadgeCell), **DataSource** (BadgeCell — "Pipeline"/"Demo"), **City** (TextCell), **Province** (TextCell), APR (PercentCell), LTV (PercentCell), Principal (CurrencyCell), **Lien Position** (BadgeCell — "1st"/"2nd"), Views (TextCell), Published At (DateCell), Featured (BadgeCell)
* Row click opens RecordSidebar ([ENG-231](https://linear.app/fairlend/issue/ENG-231/admin-shell-recordsidebar-entity-detail-sheet)) with listing details

## Storybook Requirement
* Add comprehensive Storybook stories for `EntityTable`, `EntityTableToolbar`, and every table-building component introduced in this issue, including all cell renderers and table state variants.
* Stories must cover: default data set, long-content truncation, loading, empty, no-results-after-filtering, sorting, global filtering, pagination, row selection, column visibility changes, responsive or narrow widths, and representative combinations of cell types.
* Each cell renderer introduced here should have its own story coverage with realistic data and edge cases.

## Local Storybook Pattern
`src/components/ledger/entry-type-badge.stories.tsx`
```typescript
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EntryTypeBadge } from "./entry-type-badge";

const meta = {
  title: "Ledger/EntryTypeBadge",
  component: EntryTypeBadge,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof EntryTypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;
```

## Quality Gate Rules
- `bun check`, `bun typecheck` and `bunx convex codegen` must pass before considering tasks completed.
- DO NOT try to fix linting/formatting errors BEFORE running `bun check`. Always run `bun check` first as this command also auto formats and fixes some linting errors.
- After Completing a Major unit of work like a full SPEC run `coderabbit review --plain` to get a code review summary and check for any potential issues or improvements.

## Constraints & Rules
- The route updates in this chunk are validation consumers, not final entity implementations.
- Keep the routes scaffold-friendly: local fake data is acceptable, but fake shared columns exported from the core table are not.
- Storybook coverage is part of the definition of done for this issue, not optional polish.
- Keep stories realistic enough that downstream admin-shell issues can use them as implementation guidance.
