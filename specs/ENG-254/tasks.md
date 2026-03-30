# ENG-254: Calendar View & Filter Builder — Master Task List

## Chunk 1: Calendar Query Backend
- [x] T-001: Create `convex/crm/calendarQuery.ts` with `queryCalendarRecords` query
  - Load viewDef, verify viewType === "calendar" and !needsRepair
  - Get boundFieldId from viewDef
  - Range scan `recordValuesDate.by_object_field_value` with rangeStart/rangeEnd
  - Collect unique recordIds from date value rows
  - Fan-out assembly using `assembleRecordFields` pattern from recordQueries.ts
  - Apply view-level filters as second pass (load from viewFilters table)
  - Group records by date using truncation function
  - Support `granularity` parameter ("day" | "week" | "month")
  - Return `CalendarData` shape: `{ events: Array<{ date, records }>, range }`
  - Use `crmQuery` middleware (data-plane read, any authed org user)

## Chunk 2: FilterBuilder React Component
- [x] T-002: Create `src/components/admin/shell/FilterBuilder.tsx`
  - Props: `{ viewDefId, objectDefId }`
  - Query existing filters via `listViewFilters`
  - Query active fieldDefs for this object
  - Render active filter pills (Badge + X) for each existing filter
  - "Add filter" button opens Popover with:
    - Field selector (Select from fieldDefs)
    - Operator selector (filtered by `getValidOperators(fieldType)`)
    - Value input (type-appropriate per field type)
    - Logical connector toggle (AND/OR) for 2nd+ filters
  - On submit: call `addViewFilter` mutation
  - On remove pill: call `removeViewFilter` mutation
  - ShadCN components: Badge, Button, Input, Popover, Select
  - No `any` types — all props, state fully typed
- [x] T-003: Run quality gates (`bun check`, `bun typecheck`, `bunx convex codegen`)
