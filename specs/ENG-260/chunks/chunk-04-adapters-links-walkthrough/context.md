# Chunk 4 Context: System Adapters + Links + Walkthrough

## Key Files to Read

1. `convex/crm/systemAdapters/queryAdapter.ts` — queryNativeTable, queryNativeRecords, NativeTableName
2. `convex/crm/systemAdapters/columnResolver.ts` — resolveColumnPath (pure function)
3. `convex/crm/systemAdapters/bootstrap.ts` — bootstrapSystemObjects, SYSTEM_OBJECT_CONFIGS
4. `convex/crm/types.ts` — UnifiedRecord, RecordFilter, QueryRecordsResult
5. `convex/crm/recordQueries.ts` — queryRecords (handles isSystem routing)
6. `convex/crm/__tests__/helpers.ts` — Test harness

## System Adapter Architecture

### queryNativeTable Switch Pattern
Maps runtime string → compile-time table name:
- "mortgages" → ctx.db.query("mortgages").withIndex("by_org", ...)
- "borrowers" → ctx.db.query("borrowers").withIndex("by_org", ...)
- "lenders", "brokers", "deals", "obligations" — same pattern
- Unknown table → throws ConvexError

### resolveColumnPath (Pure Function)
```typescript
function resolveColumnPath(nativeDoc: Record<string, unknown>, fieldDef: FieldDef): unknown
```
- Navigates nested paths: "terms.interestRate" → doc.terms.interestRate
- Type coercion: string dates (YYYY-MM-DD) → unix ms for date/datetime fields
- Returns undefined for missing/unresolvable paths, never throws

### UnifiedRecord Shape
```typescript
{
  _id: string;
  _kind: "record" | "native";
  objectDefId: Id<"objectDefs">;
  fields: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}
```

### queryNativeRecords
Takes objectDef + fieldDefs, queries native table, maps each doc's fields using resolveColumnPath.
Only iterates fieldDefs with `nativeColumnPath` set.

## System Object Bootstrap

`internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects` — args: { orgId }

Creates 6 system objects: mortgage, borrower, lender, broker, deal, obligation.
Each gets an objectDef (isSystem: true, nativeTable: set), fieldDefs with nativeColumnPath, capabilities, and default table view.

### Seeding Native Table Data

To test the adapter, you need native rows in the database:
```typescript
await t.run(async (ctx) => {
  await ctx.db.insert("mortgages", {
    orgId: "org_crm_test_001",
    principal: 500000,
    interestRate: 5.25,
    termMonths: 60,
    maturityDate: "2031-03-01",
    status: "active",
    paymentAmount: 2800,
    paymentFrequency: "monthly",
    loanType: "conventional",
    // ... other required fields for mortgages table
  });
});
```

**Warning:** The mortgages table has many required fields. Check the schema for the full list. You may need to provide all required fields even if the adapter only maps a subset.

## Link Files Status

**ENG-257 is NOT done. These files do NOT exist:**
- `convex/crm/linkTypes.ts`
- `convex/crm/recordLinks.ts`
- `convex/crm/linkQueries.ts`

**The schema tables DO exist:**
- `linkTypeDefs` — defined in schema.ts
- `recordLinks` — defined in schema.ts with indexes

**Strategy for links.test.ts:**
- Do NOT import from non-existent files
- Use `describe.skip()` or `it.skip()` for all link tests
- Document expected behavior in test descriptions
- The getRecord query in recordQueries.ts already queries recordLinks (outbound/inbound)

## Walkthrough Test — Section 12 Pipeline

Full flow per Architecture doc:
1. Create object ("Lead")
2. Add fields: company_name (text, required), status (select with New/Contacted/Qualified/Lost), next_followup (date), deal_value (currency)
3. Verify capabilities derived
4. Create kanban view bound to status
5. Create 3 records with different statuses
6. Query table view → 3 records
7. Query kanban view → grouped by status
8. Update one record's status
9. Search by labelValue prefix

## API Quick Reference

```typescript
// Bootstrap
internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects  // { orgId }

// Object/Field
api.crm.objectDefs.createObject    // { name, singularLabel, pluralLabel, icon }
api.crm.fieldDefs.createField      // { objectDefId, name, label, fieldType, options?, isRequired? }

// Records
api.crm.records.createRecord       // { objectDefId, values }
api.crm.records.updateRecord       // { recordId, values }

// Queries
api.crm.recordQueries.queryRecords // { objectDefId, paginationOpts, filters?, sort? }
api.crm.recordQueries.searchRecords // { objectDefId, query, limit? }

// Views
api.crm.viewDefs.createView        // { objectDefId, name, viewType, boundFieldId? }
api.crm.viewDefs.listViews         // { objectDefId }
api.crm.viewQueries.queryViewRecords // { viewDefId, cursor?, limit? }
api.crm.calendarQuery.queryCalendarRecords // { viewDefId, rangeStart, rangeEnd, granularity? }
```

## Performance Testing

convex-test runs in-process, not against a real Convex deployment.
Timing assertions should be generous (2-4x target):
- Target: 200ms for 25 records → assert < 2000ms in tests
- Use `performance.now()` around operations
- Label as "indicative, not definitive"
