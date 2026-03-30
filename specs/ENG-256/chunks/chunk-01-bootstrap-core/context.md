# Chunk 01 Context: Bootstrap Core

## Goal
Create `convex/crm/systemAdapters/bootstrap.ts` containing:
1. Type definition for system object configurations
2. Const array defining all 6 native entities with field mappings
3. Idempotent `bootstrapSystemObjects` internalMutation
4. Admin-facing `adminBootstrap` public mutation

## File to Create
- `convex/crm/systemAdapters/bootstrap.ts`

## Critical Design Decisions
- **internalMutation for bootstrap**: The org creation webhook handler runs via WorkOS AuthKit workpool with raw `MutationCtx` — no fluent-convex middleware. `bootstrapSystemObjects` MUST be an `internalMutation` accepting `{ orgId: v.string() }`.
- **Idempotency**: Query `objectDefs` by `by_org_name` index before inserting. If system object already exists, skip.
- **All fields nativeReadOnly: true**: OQ-4 decision. No write-through for v1.
- **Transaction size concern**: 6 objects × ~5 fields × capabilities × views could approach limits. Implement as a single mutation first (should be ~120 writes, well under 4,096 limit).

## Schema: objectDefs table
```typescript
defineTable({
  orgId: v.string(),
  name: v.string(),
  singularLabel: v.string(),
  pluralLabel: v.string(),
  icon: v.string(),
  description: v.optional(v.string()),
  isSystem: v.boolean(),
  nativeTable: v.optional(v.string()),
  isActive: v.boolean(),
  displayOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.string(),
})
.index("by_org", ["orgId"])
.index("by_org_name", ["orgId", "name"])
```

## Schema: fieldDefs table
```typescript
defineTable({
  orgId: v.string(),
  objectDefId: v.id("objectDefs"),
  name: v.string(),
  label: v.string(),
  fieldType: fieldTypeValidator, // 14 types
  description: v.optional(v.string()),
  isRequired: v.boolean(),
  isUnique: v.boolean(),
  isActive: v.boolean(),
  displayOrder: v.number(),
  defaultValue: v.optional(v.string()),
  options: v.optional(v.array(selectOptionValidator)),
  nativeColumnPath: v.optional(v.string()),
  nativeReadOnly: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_object", ["objectDefId"])
.index("by_object_name", ["objectDefId", "name"])
.index("by_org", ["orgId"])
```

## Schema: fieldCapabilities table
```typescript
defineTable({
  fieldDefId: v.id("fieldDefs"),
  objectDefId: v.id("objectDefs"),
  capability: capabilityValidator, // table, kanban, calendar, group_by, aggregate, sort
})
.index("by_field", ["fieldDefId"])
.index("by_object_capability", ["objectDefId", "capability"])
```

## Schema: viewDefs table
```typescript
defineTable({
  orgId: v.string(),
  objectDefId: v.id("objectDefs"),
  name: v.string(),
  viewType: viewTypeValidator, // table, kanban, calendar
  boundFieldId: v.optional(v.id("fieldDefs")),
  isDefault: v.boolean(),
  needsRepair: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.string(),
})
.index("by_object", ["objectDefId"])
.index("by_org", ["orgId"])
```

## Schema: viewFields table
```typescript
defineTable({
  viewDefId: v.id("viewDefs"),
  fieldDefId: v.id("fieldDefs"),
  isVisible: v.boolean(),
  displayOrder: v.number(),
  width: v.optional(v.number()),
})
.index("by_view", ["viewDefId"])
.index("by_field", ["fieldDefId"])
```

## selectOptionValidator
```typescript
export const selectOptionValidator = v.object({
  value: v.string(),
  label: v.string(),
  color: v.string(),
  order: v.number(),
});
```

## fieldTypeValidator (14 types)
```typescript
v.union(
  v.literal("text"), v.literal("number"), v.literal("boolean"),
  v.literal("date"), v.literal("datetime"), v.literal("select"),
  v.literal("multi_select"), v.literal("email"), v.literal("phone"),
  v.literal("url"), v.literal("currency"), v.literal("percentage"),
  v.literal("rich_text"), v.literal("user_ref")
)
```

## Metadata Compiler (from convex/crm/metadataCompiler.ts)
```typescript
export function deriveCapabilities(fieldType: FieldType): Capability[] {
  const caps: Capability[] = ["table"];
  switch (fieldType) {
    case "select": caps.push("kanban", "group_by"); break;
    case "multi_select": caps.push("kanban"); break;
    case "date": case "datetime": caps.push("calendar", "sort"); break;
    case "number": case "currency": case "percentage": caps.push("aggregate", "sort"); break;
  }
  return caps;
}
```

## Existing Patterns: createObject (from convex/crm/objectDefs.ts)
```typescript
// Auto-create default table view
await ctx.db.insert("viewDefs", {
  orgId,
  objectDefId,
  name: `All ${args.pluralLabel}`,
  viewType: "table",
  isDefault: true,
  needsRepair: false,
  createdAt: now,
  updatedAt: now,
  createdBy: ctx.viewer.authId,  // NOTE: In bootstrap, use "system" since no viewer
});
```

## Existing Patterns: createField capabilities + viewFields (from convex/crm/fieldDefs.ts)
```typescript
// Run capability compiler
const capabilities = deriveCapabilities(args.fieldType);
for (const capability of capabilities) {
  await ctx.db.insert("fieldCapabilities", {
    fieldDefId,
    objectDefId: args.objectDefId,
    capability,
  });
}

// Auto-add to default view's viewFields
const defaultView = await ctx.db
  .query("viewDefs")
  .withIndex("by_object", (q) => q.eq("objectDefId", args.objectDefId))
  .filter((q) => q.eq(q.field("isDefault"), true))
  .first();
if (defaultView) {
  const existingViewFields = await ctx.db
    .query("viewFields")
    .withIndex("by_view", (q) => q.eq("viewDefId", defaultView._id))
    .collect();
  await ctx.db.insert("viewFields", {
    viewDefId: defaultView._id,
    fieldDefId,
    isVisible: true,
    displayOrder: existingViewFields.length,
  });
}
```

## Existing crmAdminMutation pattern (from convex/fluent.ts)
```typescript
export const crmAdminMutation = authedMutation
  .use(requireOrgContext)
  .use(requireAdmin);
```

## Audit logging pattern (from convex/crm/objectDefs.ts)
```typescript
import { auditLog } from "../auditLog";

await auditLog.log(ctx, {
  action: "crm.object.created",
  actorId: ctx.viewer.authId,
  resourceType: "objectDefs",
  resourceId: objectDefId,
  severity: "info",
  metadata: { name: args.name, orgId },
});
```

## System Object Definitions — All 6 Entities

### Mortgage — nativeTable: "mortgages"
| Field Name | Field Type | nativeColumnPath | Notes |
|------------|-----------|-----------------|-------|
| principal | currency | `principal` | Amount in cents |
| interestRate | percentage | `interestRate` | |
| termMonths | number | `termMonths` | |
| maturityDate | date | `maturityDate` | ⚠️ String (YYYY-MM-DD) in schema, coerced by columnResolver |
| status | select | `status` | Options from mortgage machine |
| paymentAmount | currency | `paymentAmount` | Amount in cents |
| paymentFrequency | select | `paymentFrequency` | monthly, bi_weekly, accelerated_bi_weekly, weekly |
| loanType | select | `loanType` | conventional, insured, high_ratio |

**Mortgage machine states**: active, delinquent, defaulted, collections, written_off, matured

**paymentFrequency values**: monthly, bi_weekly, accelerated_bi_weekly, weekly

**loanType values**: conventional, insured, high_ratio

### Borrower — nativeTable: "borrowers"
| Field Name | Field Type | nativeColumnPath |
|------------|-----------|-----------------|
| status | select | `status` |
| idvStatus | select | `idvStatus` |

**Borrower statuses**: active
**idvStatus values**: verified, pending_review, manual_review_required

### Lender — nativeTable: "lenders"
| Field Name | Field Type | nativeColumnPath |
|------------|-----------|-----------------|
| accreditationStatus | select | `accreditationStatus` |
| status | select | `status` |
| payoutFrequency | select | `payoutFrequency` |

**Lender statuses**: active, pending_activation
**accreditationStatus values**: pending, accredited, exempt, rejected
**payoutFrequency values**: monthly, bi_weekly, weekly, on_demand

### Broker — nativeTable: "brokers"
| Field Name | Field Type | nativeColumnPath |
|------------|-----------|-----------------|
| status | select | `status` |
| licenseId | text | `licenseId` |
| brokerageName | text | `brokerageName` |

**Broker statuses**: active

### Deal — nativeTable: "deals"
| Field Name | Field Type | nativeColumnPath | Notes |
|------------|-----------|-----------------|-------|
| fractionalShare | percentage | `fractionalShare` | |
| closingDate | date | `closingDate` | v.optional(v.number()) — unix ms, may be null |
| status | select | `status` | From deal machine |
| lockingFeeAmount | currency | `lockingFeeAmount` | Optional, cents |

**Deal machine states**: initiated, lawyerOnboarding, documentReview, fundsTransfer, confirmed, failed

### Obligation — nativeTable: "obligations"
| Field Name | Field Type | nativeColumnPath | Notes |
|------------|-----------|-----------------|-------|
| type | select | `type` | regular_interest, arrears_cure, late_fee, principal_repayment |
| amount | currency | `amount` | Cents |
| dueDate | date | `dueDate` | Unix ms number |
| status | select | `status` | From obligation machine |

**Obligation machine states**: upcoming, due, overdue, partially_settled, settled, waived
**Obligation type values**: regular_interest, arrears_cure, late_fee, principal_repayment

## Important Imports
```typescript
// For internalMutation
import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

// For crmAdminMutation
import { crmAdminMutation } from "../../fluent";

// For deriveCapabilities
import { deriveCapabilities } from "../metadataCompiler";

// For audit logging
import { auditLog } from "../../auditLog";

// For types
import type { Doc } from "../../_generated/dataModel";
```

## Implementation Notes
1. The `createdBy` field on objectDefs/viewDefs: use `"system"` for bootstrap (no viewer context in internalMutation).
2. For `adminBootstrap`, use `ctx.viewer.authId` as createdBy since it runs through crmAdminMutation.
3. Count existing objectDefs for displayOrder before inserting each new one.
4. For each system object, after creating objectDef and all fieldDefs, create the default table view and viewFields.
5. The bootstrap function should return a summary object showing what was created vs skipped.
