# Chunk Context: renderers-toolbar

Source: Linear `ENG-230`, Notion implementation plan + linked pages.
This file and the accompanying `tasks.md` contain everything needed to implement this chunk.

## Linear Issue Scope
### Cell Renderers (`src/components/admin/shell/cell-renderers.tsx`)

* `TextCell` — plain text with truncation
* ImageCell — Thumbnail of the linked image
* `BadgeCell` — status/type as colored badge
* `CurrencyCell` — formatted dollars/cents
* `DateCell` — relative or absolute date
* `AvatarCell` — user avatar + name
* `PercentCell` — percentage with optional color coding
* `LinkCell` — clickable entity reference (polymorphic relation)
* Mutli-select cell - Multi-select combo box
* Select Cell - Drop down select menu

### Toolbar (`src/components/admin/shell/EntityTableToolbar.tsx`)

* Global search input (debounced, uses `@tanstack/match-sorter-utils`)
* Column visibility toggle dropdown
* Active filter pills with clear
* View toggle: Table / Kanban (future)
* "New" button slot (optional, entity-specific)

### States

* Pagination using `src/components/ui/pagination.tsx`
* Row selection with checkbox column (optional)
* Empty state using `src/components/ui/empty.tsx`
* Loading state with skeleton rows using `src/components/ui/skeleton.tsx`

## Storybook & Accessibility Requirements
### Storybook

* Add comprehensive Storybook stories for `EntityTable`, `EntityTableToolbar`, and every table-building component introduced in this issue, including all cell renderers and table state variants.
* Stories must cover: default data set, long-content truncation, loading, empty, no-results-after-filtering, sorting, global filtering, pagination, row selection, column visibility changes, responsive or narrow widths, and representative combinations of cell types.
* Each cell renderer introduced here should have its own story coverage with realistic data and edge cases.

### Accessibility

* Use semantic table markup and accessible controls throughout.
* Sortable headers must expose state to assistive tech, icon-only controls must have accessible names, focus must remain visible, and keyboard interaction must work across search, filters, column toggles, pagination, row selection, links, and row actions.
* Ensure sufficient color contrast and do not communicate status or meaning exclusively through color.

## Implementation Plan Excerpt
### Step 3: Create shared rich renderers
- **Files:** `src/components/admin/shell/cell-renderers.tsx`
- **Action:** Create file.
- **Details:** Implement display helpers for text, badges, currency, dates, avatars, percentages, links, select values, and multi-select values. These should be polished renderer primitives, not placeholder formatters.
- **Validation:** Listing, mortgage, and CRM screens can import shared renderers without duplicating formatting code.

### Step 4: Create the toolbar module
- **Files:** `src/components/admin/shell/EntityTableToolbar.tsx`
- **Action:** Create file.
- **Details:** Add debounced global search, column visibility toggles, active filter chips, optional view-toggle seam, and an optional new-button slot.
- **Validation:** Toolbar renders independently and can be composed above the table.

### Step 5: Add loading, empty, and interaction polish
- **Files:** `src/components/admin/shell/EntityTable.tsx`, `src/components/admin/shell/EntityTableToolbar.tsx`
- **Action:** Enhance implementation.
- **Details:** Render skeleton rows when `isLoading` is true, show a dedicated empty state when no rows exist, distinguish “no data” from “no filter results” when possible, and make row click/hover/selection states feel intentional.
- **Validation:** Loading and empty states are visible without breaking table layout, and row interactions feel production-ready.

## Admin Dashboard / CRM Context
## Entity Table Screens — Twenty.com Pattern
Every entity table screen follows the same architecture:
**A. Table View (primary surface)**
- Powered by CRM view engine: `viewQueries.queryViewRecords` with native adapter
- `RecordTableSurface` component (promote from `src/components/demo/crm/`)
- `FilterBuilder` component (exists in `src/components/admin/shell/`)
- Supports Kanban view toggle for status-driven entities (mortgages, deals, obligations)

## The View Engine: Fields That Unlock UI
This is the feature that makes the metadata engine feel magical to end users: **adding a field automatically enables new views.**
Create a "Status" select field on any object → a kanban board becomes available. Create a "Due Date" date field → a calendar view appears. No configuration. No code. The metadata compiler derived the capabilities, and the view engine checks them.

### View Types
- **Table**: Renders rows and columns. Default for every object.
- **Kanban**: Requires a `select` or `multi_select` field. Groups records into columns by select value. Drag to change status.
- **Calendar**: Requires a `date` or `datetime` field. Places records on a date grid.

## Relevant Existing Components
- `src/components/ui/pagination.tsx`
- `src/components/ui/empty.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/demo/crm/utils.ts` for existing field formatting patterns
- `src/components/demo/crm/RecordTableSurface.tsx` for CRM preview rendering and keyboard row selection

## Constraints & Rules
- The toolbar and renderers must stay reusable by later issues (`ENG-231`, `ENG-232`, `ENG-241`).
- Do not move data-fetching into toolbar or renderer modules.
- Keep the view toggle as a seam, not a fully wired kanban implementation in this issue.
- Keep status meaning accessible without relying on color alone.
- Prefer existing shadcn and repo primitives over introducing new dependency-heavy abstractions.
