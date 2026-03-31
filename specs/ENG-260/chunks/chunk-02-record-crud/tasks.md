# Chunk 2: Record CRUD Tests

## T-004: Create record CRUD tests (`convex/crm/__tests__/records.test.ts`)

### Test Structure

```typescript
describe("Record CRUD", () => {
  describe("createRecord", () => {
    it("creates record with all 14 field types → correct value table routing")
    it("populates labelValue from first text field by displayOrder")
    it("rejects missing required field with ConvexError")
    it("rejects wrong type (e.g., string for number field) with ConvexError")
    it("rejects unknown field name with ConvexError")
    it("org-scoped: different org identity cannot query the record")
    it("emits crm.record.created audit event")
  });

  describe("updateRecord", () => {
    it("deletes old value row and inserts new value")
    it("updates labelValue when first text field changes")
    it("emits crm.record.updated audit event with before/after diff")
  });

  describe("deleteRecord", () => {
    it("soft-deletes by setting isDeleted=true")
    it("preserves value rows (not deleted)")
    it("emits crm.record.deleted audit event")
    it("deleted record not returned by queryRecords")
  });
});
```

### Key Implementation Details

**Creating records with all 14 field types:**
Seed an object with one field per type, then create a record providing all 14 values.
Verify by querying the record and checking each field value matches.

**Value table routing verification:**
After creating a record, use `t.run(async (ctx) => { ... })` to directly query the typed value tables and verify values are in the correct table.

**Audit event verification:**
After each mutation, query the audit trail. The audit-log stores events that can be queried.
Use `t.run()` to check the audit tables contain the expected action.

**Org scoping test:**
Create a record as CRM_ADMIN_IDENTITY, then try to query it as DIFFERENT_ORG_IDENTITY — should not be found.

### Validation
- All CRUD operation tests pass
- Audit events verified for each mutation type
- `bun run test convex/crm/__tests__/records` passes

---

## T-005: Run tests to validate chunk

```bash
bun run test convex/crm/__tests__/
```

All tests from chunks 1-2 pass together.
