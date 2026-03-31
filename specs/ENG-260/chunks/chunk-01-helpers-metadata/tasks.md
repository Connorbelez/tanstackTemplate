# Chunk 1: Test Harness + Metadata Compiler Tests

## T-001: Create test helpers (`convex/crm/__tests__/helpers.ts`)

Create a shared test harness file with:

### `createCrmTestHarness()`
```typescript
import { convexTest } from "convex-test";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

export function createCrmTestHarness() {
  const t = convexTest(schema, modules);
  // Register audit-log component — CRM mutations call auditLog.log()
  // Per AGENT_LESSONS Lesson 13
  return t;
}
```

**IMPORTANT**: Per Lesson 13, you MUST register the `convex-audit-log` component because CRM mutations call `auditLog.log()`. Import from `convex-audit-log/test` and call the register function on the test instance. Check existing test patterns in `convex/accrual/__tests__/` for reference, but note that accrual tests may NOT register audit-log if they don't hit those code paths. Since CRM mutations DO call `auditLog.log()` and `auditLog.logChange()`, registration is required.

### Identity Fixtures
```typescript
export const CRM_ADMIN_IDENTITY = {
  subject: "test-crm-admin",
  issuer: "https://api.workos.com",
  org_id: "org_crm_test_001",
  organization_name: "CRM Test Org",
  role: "admin",
  roles: JSON.stringify(["admin"]),
  permissions: JSON.stringify(["widgets:users-table:manage"]),
  user_email: "crm-admin@test.fairlend.ca",
  user_first_name: "CRM",
  user_last_name: "Admin",
};

export const CRM_USER_IDENTITY = {
  subject: "test-crm-user",
  issuer: "https://api.workos.com",
  org_id: "org_crm_test_001",
  organization_name: "CRM Test Org",
  role: "member",
  roles: JSON.stringify(["member"]),
  permissions: JSON.stringify([]),
  user_email: "crm-user@test.fairlend.ca",
  user_first_name: "CRM",
  user_last_name: "User",
};

export const DIFFERENT_ORG_IDENTITY = {
  subject: "test-other-org-admin",
  issuer: "https://api.workos.com",
  org_id: "org_other_test_002",
  organization_name: "Other Org",
  role: "admin",
  roles: JSON.stringify(["admin"]),
  permissions: JSON.stringify(["widgets:users-table:manage"]),
  user_email: "other-admin@test.fairlend.ca",
  user_first_name: "Other",
  user_last_name: "Admin",
};
```

### Seed Helpers
```typescript
export interface CrmTestFixture {
  objectDefId: Id<"objectDefs">;
  fieldDefs: Record<string, Id<"fieldDefs">>;
  defaultViewId: Id<"viewDefs">;
}

// seedObjectWithFields: creates objectDef + fieldDefs via mutations
// Returns CrmTestFixture with IDs
// Uses api.crm.objectDefs.createObject and api.crm.fieldDefs.createField

// seedRecord: creates a record via api.crm.records.createRecord
```

The seed helpers should use `t.withIdentity(CRM_ADMIN_IDENTITY)` to call the actual Convex mutations (not direct DB inserts), since the mutations require admin + org context via fluent middleware.

### Validation
- File compiles with `bun typecheck`
- `createCrmTestHarness()` instantiates without error

---

## T-002: Create metadata compiler tests (`convex/crm/__tests__/metadataCompiler.test.ts`)

### What to test

The metadata compiler (`convex/crm/metadataCompiler.ts`) is a pure function `deriveCapabilities(fieldType) → Capability[]`.

The 14 field types map to capabilities as follows:
- text, email, phone, url, rich_text, user_ref → [table]
- number, currency, percentage → [table, aggregate, sort]
- boolean → [table]
- date, datetime → [table, calendar, sort]
- select → [table, kanban, group_by]
- multi_select → [table, kanban]

### Test structure

```typescript
describe("metadataCompiler", () => {
  describe("deriveCapabilities", () => {
    // Test each of the 14 field types individually
    it("text → [table]", ...)
    it("email → [table]", ...)
    // ... all 14

    // Edge case: unknown field type (if possible via type assertion)
  });

  describe("capability lifecycle via mutations", () => {
    // These use convex-test to verify the integration:

    it("createField inserts correct capabilities", async () => {
      // Create object, create field with type "select"
      // Query fieldCapabilities by_field index
      // Verify ["table", "kanban", "group_by"]
    });

    it("updateField with type change re-derives capabilities", async () => {
      // Create text field → capabilities: [table]
      // Update to "select" type → capabilities should now be [table, kanban, group_by]
      // Old capabilities deleted, new ones inserted
    });

    it("deactivateField removes all capabilities", async () => {
      // Create field → has capabilities
      // Deactivate field → capabilities deleted
    });

    it("capabilities queryable via by_object_capability index", async () => {
      // Create object with select + date fields
      // Query by_object_capability for "kanban" → should return select field's capability
      // Query for "calendar" → should return date field's capability
    });
  });
});
```

### Validation
- All 14 type tests pass
- Capability lifecycle tests pass
- `bun run test convex/crm/__tests__/metadataCompiler` passes

---

## T-003: Run tests to validate chunk

```bash
bun run test convex/crm/__tests__/
```

All tests from T-001 and T-002 pass.
