# Chunk 3 Context: View Engine Tests

## Key Files to Read

1. `convex/crm/viewQueries.ts` — queryViewRecords (table + kanban), getViewSchema, moveKanbanRecord
2. `convex/crm/calendarQuery.ts` — queryCalendarRecords
3. `convex/crm/viewDefs.ts` — createView, updateView, deleteView, KANBAN_NO_VALUE_SENTINEL
4. `convex/crm/viewFields.ts` — viewField management
5. `convex/crm/viewFilters.ts` — viewFilter management
6. `convex/crm/viewKanbanGroups.ts` — kanban group management
7. `convex/crm/recordQueries.ts` — applyFilters, matchesFilter (shared filter logic)
8. `convex/crm/__tests__/helpers.ts` — Test harness

## API References

View CRUD:
- `api.crm.viewDefs.createView` — args: { objectDefId, name, viewType, boundFieldId? }
- `api.crm.viewDefs.listViews` — args: { objectDefId }

View queries:
- `api.crm.viewQueries.queryViewRecords` — args: { viewDefId, cursor?, limit? }
  - Returns TableViewResult for table views: { columns, rows, totalCount, cursor }
  - Returns KanbanViewResult for kanban views: { groups, totalCount }
- `api.crm.viewQueries.getViewSchema` — args: { viewDefId }
- `api.crm.viewQueries.moveKanbanRecord` — args: { recordId, viewDefId, targetGroupValue }

Calendar query:
- `api.crm.calendarQuery.queryCalendarRecords` — args: { viewDefId, rangeStart, rangeEnd, granularity? }
  - Returns CalendarData: { events: CalendarEvent[], range, truncated, skippedFilters }

## KANBAN_NO_VALUE_SENTINEL

```typescript
export const KANBAN_NO_VALUE_SENTINEL = "__no_value__";
```

Records without a value for the kanban bound field are placed in the "No Value" group.

## View Types

- `table` — any fields, default view type
- `kanban` — requires select or multi_select field with kanban capability
- `calendar` — requires date or datetime field with calendar capability

## View Creation Flow

1. createView validates bound field has required capability
2. For kanban: auto-creates viewKanbanGroups (one per select option + "No Value")
3. Auto-populates viewFields from all active fieldDefs

## View Filters Schema

viewFilters table:
```typescript
{
  viewDefId: Id<"viewDefs">,
  fieldDefId: Id<"fieldDefs">,
  operator: string,  // eq, gt, lt, contains, etc.
  value?: string,    // JSON-encoded value
  logicalOperator?: "and" | "or",
}
```

For tests, you may need to insert viewFilters directly via `t.run()` since there's no public mutation for filter management exposed yet.

## Filter Operators

The queryViewRecords table view uses:
- convertViewFiltersToRecordFilters() → then applyFilters()
- All RecordFilter operators: eq, gt, lt, gte, lte, contains, starts_with, is_any_of, is_true, is_false

The calendarQuery uses a richer set via parseViewFilters():
- Additional operators: equals, is, is_not, before, after, between

## Deactivate Field → needsRepair

When `deactivateField` is called:
1. Sets fieldDef.isActive = false
2. Finds views where `boundFieldId === fieldDefId`
3. Sets those views' `needsRepair = true`
4. Deletes capabilities, viewFields, viewFilters, viewKanbanGroups for the field

## queryViewRecords needsRepair Check

```typescript
if (viewDef.needsRepair) {
  throw new ConvexError("This view needs repair before it can be queried...");
}
```

## moveKanbanRecord Flow

1. Validates view is kanban + org ownership
2. Reads existing value for audit diff
3. Deletes old value row
4. Writes new value (or nothing if targetGroupValue === KANBAN_NO_VALUE_SENTINEL)
5. Updates record timestamp
6. Emits audit event with before/after diff
