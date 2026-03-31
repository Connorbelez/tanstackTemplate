# Chunk 3: View Engine Tests

## T-006: Create view engine tests (`convex/crm/__tests__/viewEngine.test.ts`)

### Test Structure

```typescript
describe("View Engine", () => {
  describe("Table view", () => {
    it("returns columns matching viewFields config in displayOrder")
    it("only includes visible fields in row data")
    it("pagination with cursor returns next page")
  });

  describe("Kanban view", () => {
    it("groups records by select field value (UC-93)")
    it("each group has correct count and records")
    it("records without grouping field value go to 'No Value' group")
    it("multi_select kanban: record appears in multiple groups")
  });

  describe("Calendar view", () => {
    it("returns records within date range")
    it("records outside range are excluded")
    it("groups records by day granularity")
  });

  describe("View filters", () => {
    it("eq filter: exact match")
    it("gt/lt/gte/lte: numeric range filters")
    it("contains: substring match (case-insensitive)")
    it("starts_with: prefix match (case-insensitive)")
    it("is_any_of: matches any value in array")
    it("is_true / is_false: boolean filters")
  });

  describe("View schema", () => {
    it("getViewSchema returns column definitions with sort capability info")
  });

  describe("View integrity", () => {
    it("deactivating bound field sets view.needsRepair = true")
    it("querying a needsRepair view throws ConvexError")
  });

  describe("moveKanbanRecord", () => {
    it("updates field value when dragging to new group")
    it("emits audit event with before/after diff")
    it("moving to 'No Value' group clears the field value")
  });
});
```

### Key Implementation Details

**Seed setup for view tests:**
1. Create object with fields: company_name (text), status (select), next_followup (date), deal_value (currency), is_active (boolean)
2. Create 3+ records with different field values
3. Create views (table, kanban bound to status, calendar bound to next_followup)

**Table view testing:**
Use `api.crm.viewQueries.queryViewRecords` with viewDefId of a table view.
Verify columns match viewFields, rows have only visible field data.

**Kanban view testing:**
Create kanban view bound to "status" select field.
Verify records are grouped into correct groups (matching select option values).
Create a record without a status value — should appear in "No Value" group.

**Calendar view testing:**
Use `api.crm.calendarQuery.queryCalendarRecords` with viewDefId, rangeStart, rangeEnd.
Create records with date values inside and outside the range.

**View filter testing:**
Create viewFilters for a view using `t.run()` to insert directly into viewFilters table.
Then query the view and verify filtering works.

**View integrity testing:**
Create a kanban view, then deactivate the bound field via `deactivateField`.
Verify the viewDef's needsRepair is now true.
Try to query the view — should throw ConvexError about needing repair.

### Validation
- All view type tests pass
- Filter tests cover all operators
- Integrity tests verify needsRepair flow
- `bun run test convex/crm/__tests__/viewEngine` passes

---

## T-007: Run tests to validate chunk

```bash
bun run test convex/crm/__tests__/
```

All tests from chunks 1-3 pass.
