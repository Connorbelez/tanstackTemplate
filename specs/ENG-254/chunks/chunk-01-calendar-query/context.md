# Chunk 01 Context: Calendar Query Backend

## Objective
Create `convex/crm/calendarQuery.ts` — a Convex query that returns records grouped by date within a range for calendar view rendering.

## File to Create
- `convex/crm/calendarQuery.ts` (NEW)

## Key Design Decisions

### Query Signature
```typescript
queryCalendarRecords({
  viewDefId: Id<"viewDefs">,
  rangeStart: number,  // unix ms
  rangeEnd: number,    // unix ms
  granularity?: "day" | "week" | "month"  // defaults to "day"
})
```

### Algorithm
1. Load viewDef — verify `viewType === "calendar"` and `!needsRepair`
2. Get `boundFieldId` from viewDef (the date/datetime field)
3. Load objectDef from viewDef to get `objectDefId`
4. Range scan `recordValuesDate.by_object_field_value`:
   ```typescript
   ctx.db.query("recordValuesDate")
     .withIndex("by_object_field_value", q =>
       q.eq("objectDefId", objectDefId)
        .eq("fieldDefId", boundFieldId)
        .gte("value", rangeStart)
        .lte("value", rangeEnd)
     ).collect()
   ```
4a. Limit results to `FILTERED_QUERY_CAP + 1` records. If `CAP + 1` results are returned, set `truncated = true` and drop the last result so only `FILTERED_QUERY_CAP` records are processed. This matches the truncation pattern used in `recordQueries.ts`.
5. Collect unique recordIds from results
6. For each record: fan-out assembly (reuse pattern from `recordQueries.ts`)
7. Load view-level filters from viewFilters table and apply as second pass
8. Group records by date using truncation function based on granularity
9. Return CalendarData shape

### Return Shape
```typescript
type CalendarData = {
  events: Array<{
    date: number;  // unix ms, start of period (day/week/month)
    records: UnifiedRecord[];
  }>;
  range: { start: number; end: number };
  skippedFilters: number;    // Count of filters that couldn't be applied
  truncated: boolean;         // Whether results hit FILTERED_QUERY_CAP
};
```

### Middleware
Use `crmQuery` (data-plane read — any authed user with org context). This matches `queryRecords` in `recordQueries.ts`.

### Date Grouping
```typescript
function truncateToDay(unixMs: number): number {
  const d = new Date(unixMs);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function truncateToWeek(unixMs: number): number {
  const d = new Date(unixMs);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day); // Sunday start
  return d.getTime();
}

function truncateToMonth(unixMs: number): number {
  const d = new Date(unixMs);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
```

### View Filter Application
After the range scan returns candidate records, apply viewFilters as a second pass. This matches how table/kanban views work. The range scan narrows by date; viewFilters further narrow by other fields.

Filter application should reuse the `matchesFilter` pattern from `recordQueries.ts`. Since that function is not exported, either:
- Extract it to a shared module (preferred — DRY)
- OR re-implement the same logic

**Recommendation:** Extract `matchesFilter`, `applyFilters`, `applySort`, `loadActiveFieldDefs`, `assembleRecordFields`, `assembleRecords`, and `readValuesFromTable` from `recordQueries.ts` into a shared `convex/crm/recordAssembly.ts` file. This avoids duplicating the fan-out assembly logic.

However, to minimize scope creep, the agent may also inline the needed helpers if extraction would be too disruptive.

## Existing Code to Reference

### recordQueries.ts patterns to reuse:
- `readValuesFromTable(ctx, table, recordId)` — reads values from typed table using `by_record` index
- `assembleRecordFields(ctx, recordId, fieldDefs)` — fans out to all relevant typed tables
- `assembleRecords(ctx, records, fieldDefs)` — batch assembly into UnifiedRecord[]
- `loadActiveFieldDefs(ctx, objectDefId)` — loads active fieldDefs for an object
- `matchesFilter(fieldValue, operator, filterValue)` — field-level filter matching
- `applyFilters(records, filters, fieldDefsById)` — applies filters to assembled records

### valueRouter.ts:
- `fieldTypeToTable(fieldType)` — maps field type to storage table name
- `ValueTableName` type — union of all typed value table names

### types.ts:
- `UnifiedRecord` — the canonical record shape
- `RecordFilter` — filter condition type

### Schema (recordValuesDate):
```typescript
recordValuesDate: defineTable({
  recordId: v.id("records"),
  fieldDefId: v.id("fieldDefs"),
  objectDefId: v.id("objectDefs"),
  value: v.number(),  // unix ms
})
  .index("by_record", ["recordId"])
  .index("by_record_field", ["recordId", "fieldDefId"])
  .index("by_object_field_value", ["objectDefId", "fieldDefId", "value"])
```

### Schema (viewDefs):
```typescript
viewDefs: defineTable({
  orgId: v.string(),
  objectDefId: v.id("objectDefs"),
  name: v.string(),
  viewType: viewTypeValidator,  // "table" | "kanban" | "calendar"
  boundFieldId: v.optional(v.id("fieldDefs")),
  isDefault: v.boolean(),
  needsRepair: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.string(),
})
```

### Schema (viewFilters):
```typescript
viewFilters: defineTable({
  viewDefId: v.id("viewDefs"),
  fieldDefId: v.id("fieldDefs"),
  operator: filterOperatorValidator,
  value: v.optional(v.string()),
  logicalOperator: v.optional(logicalOperatorValidator),
})
  .index("by_view", ["viewDefId"])
  .index("by_field", ["fieldDefId"])
```

### Fluent middleware:
```typescript
// Data Plane queries (any authed user with org context)
export const crmQuery = authedQuery.use(requireOrgContext);
```

## Constraints
- No `any` types
- Use `crmQuery` middleware chain
- Range scan MUST use `by_object_field_value` compound index — not full table scan + filter
- Reuse fan-out assembly pattern from recordQueries.ts (DRY)
- `bun check` and `bun typecheck` must pass
