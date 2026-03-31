# Chunk 4: System Adapters + Links + Walkthrough

## T-008: Create system adapter tests (`convex/crm/__tests__/systemAdapters.test.ts`)

### Test Structure

```typescript
describe("System Adapters", () => {
  describe("queryNativeTable", () => {
    it("returns documents from mortgages table")
    it("returns documents from borrowers table")
    it("returns documents from lenders table")
    it("returns documents from brokers table")
    it("returns documents from deals table")
    it("returns documents from obligations table")
    it("org-scoped: only returns docs from caller's org")
    it("throws on unknown table name")
  });

  describe("resolveColumnPath", () => {
    it("maps simple native field name to document property")
    it("handles nested paths (dot notation)")
    it("coerces string dates to unix ms for date/datetime fields")
    it("returns undefined for missing path")
    it("passes through string IDs (WorkOS auth IDs) as-is")
  });

  describe("UnifiedRecord contract", () => {
    it("EAV record has _kind: 'record' with correct fields")
    it("native record has _kind: 'native' with correct fields")
    it("both shapes have identical keys: _id, _kind, objectDefId, fields, createdAt, updatedAt")
  });

  describe("queryNativeRecords", () => {
    it("assembles native documents into UnifiedRecord[] using field mappings")
    it("only maps fields with nativeColumnPath set")
  });
});
```

### Key Implementation Details

**Seeding native table rows:**
Use `t.run()` to directly insert rows into native tables (mortgages, borrowers, etc.) with `orgId` set.
Then bootstrap system objects so the adapter has objectDefs and fieldDefs to work with.

**System object bootstrap:**
Use `internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects` with the test org's orgId.
This creates system objectDefs, fieldDefs, capabilities, and default views.

**Testing queryNativeTable:**
Import the function directly from `convex/crm/systemAdapters/queryAdapter.ts` and call within `t.run()` since it needs a QueryCtx.

**Testing resolveColumnPath:**
Import as a pure function and test directly (no convex-test needed for this).

### Validation
- All 6 native table switch cases tested
- resolveColumnPath handles all edge cases
- UnifiedRecord shape verified for both EAV and native
- `bun run test convex/crm/__tests__/systemAdapters` passes

---

## T-009: Create link tests (`convex/crm/__tests__/links.test.ts`)

### ⚠️ ENG-257 NOT DONE — Link backend files don't exist yet

The files `linkTypes.ts`, `recordLinks.ts`, and `linkQueries.ts` have NOT been created.
The `recordLinks` and `linkTypeDefs` tables ARE defined in schema.ts.

**Strategy:** Write the test file with `it.skip()` for all tests. This:
- Documents the expected test coverage
- Compiles and shows in test output
- Will be unskipped when ENG-257 lands

### Test Structure (all skipped)

```typescript
describe("Links", () => {
  describe.skip("Link type CRUD", () => {
    it("creates link type with all three cardinalities")
    it("deactivation blocked when active links exist")
  });

  describe.skip("createLink validation (fail-fast order)", () => {
    it("rejects wrong source/target objectDefId (type match)")
    it("rejects cross-org link (different org sources)")
    it("rejects duplicate link (same source+target+type)")
    it("rejects one_to_one when existing link exists (cardinality)")
  });

  describe.skip("Bidirectional queries", () => {
    it("outbound links returned correctly")
    it("inbound links returned correctly")
    it("both directions returned when direction='both'")
  });

  describe.skip("Polymorphic links", () => {
    it("links EAV record to EAV record")
    it("links EAV record to native entity (UC-95)")
    it("bidirectional query from native entity side returns EAV record")
  });

  describe.skip("Soft-delete", () => {
    it("deleted link not returned in queries")
    it("deleted link doesn't block duplicate detection")
  });
});
```

### Validation
- File compiles
- All tests show as skipped in output
- No import errors (don't import from non-existent files)

---

## T-010: Create walkthrough test (`convex/crm/__tests__/walkthrough.test.ts`)

### End-to-end integration test following Architecture doc Section 12

```typescript
describe("EAV-CRM Walk-Through", () => {
  it("full pipeline: create → fields → view → records → query → search", async () => {
    // 1. Create object ("Lead") → verify default table view auto-created
    // 2. Add fields: company_name (text, required), status (select), next_followup (date), deal_value (currency)
    // 3. Verify capabilities: status has kanban+group_by, next_followup has calendar+sort
    // 4. Create kanban view bound to status field
    // 5. Create 3 records with different status values
    // 6. Query table view → verify 3 records returned with correct columns
    // 7. Query kanban view → verify records grouped by status
    // 8. Update record status → verify different field value
    // 9. Search records by labelValue → verify prefix match
    // 10. Performance check: measure timing (generous margins for CI)
  });
});
```

### Key Details

This test exercises the ENTIRE pipeline in a single test — it's the capstone that validates all layers work together.

Do NOT break this into multiple small tests — it's intentionally one long test that builds on previous steps within the same transaction context.

The performance check should use `performance.now()` around queryRecords calls and assert timing < 2000ms (generous margin for convex-test in-process execution).

### Validation
- Full pipeline test passes end-to-end
- All intermediate assertions verified
- Performance timing logged

---

## T-011: Final quality gate

Run all quality checks:

```bash
bun run test                # All CRM tests pass
bun check                   # Lint + format
bun typecheck               # TypeScript compilation
```

All must pass with zero failures.
