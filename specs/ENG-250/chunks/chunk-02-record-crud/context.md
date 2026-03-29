# Chunk 2 Context: Record CRUD Mutations

## What You're Building
Three mutations in `convex/crm/records.ts`: createRecord, updateRecord, deleteRecord. Plus two internal helpers: writeValue, readExistingValue.

## Middleware Chain
Use `crmMutation` from `convex/fluent.ts` — this is `authedMutation.use(requireOrgContext)`.
- `ctx.viewer.orgId` — guaranteed string (org context)
- `ctx.viewer.authId` — WorkOS user subject ID
- Do NOT use `crmAdminMutation` — data plane ops are for any authed org user

## Schema: records table
```typescript
records: defineTable({
    orgId: v.string(),
    objectDefId: v.id("objectDefs"),
    labelValue: v.optional(v.string()),
    isDeleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.string(),
})
    .index("by_object", ["objectDefId"])
    .index("by_org_object", ["orgId", "objectDefId"])
    .index("by_org_label", ["orgId", "labelValue"]),
```

## Schema: Value Tables (all 8 follow this pattern)
```typescript
recordValuesText: defineTable({
    recordId: v.id("records"),
    fieldDefId: v.id("fieldDefs"),
    objectDefId: v.id("objectDefs"),
    value: v.string(),  // type varies per table
})
    .index("by_record", ["recordId"])
    .index("by_record_field", ["recordId", "fieldDefId"])
    .index("by_object_field_value", ["objectDefId", "fieldDefId", "value"]),
```

**IMPORTANT**: `recordValuesMultiSelect` uses `value: v.array(v.string())` (NOT `values`). It has NO `by_object_field_value` index.

## Helpers to Implement

### writeValue(ctx, recordId, fieldDef, value)
Internal helper. Routes value to correct table using `fieldTypeToTable()` from valueRouter.ts.
Must use a switch statement on table name because Convex requires compile-time table names.

### readExistingValue(ctx, recordId, fieldDef)
Internal helper for updates. Queries via `by_record_field` index. Returns the existing row or null.
Same switch pattern needed.

### deleteExistingValue(ctx, recordId, fieldDef)
Reads existing value then deletes it. Used in updateRecord.

## T-004: createRecord Mutation

```typescript
export const createRecord = crmMutation
    .input({
        objectDefId: v.id("objectDefs"),
        values: v.any(), // Record<fieldName, value>
    })
    .handler(async (ctx, args) => { ... })
    .public();
```

Steps:
1. Get orgId from ctx.viewer.orgId (guaranteed non-null by `requireOrgContext` middleware)
2. Load objectDef, verify exists + active + orgId matches (REQ-166)
3. Load active fieldDefs for this object via `by_object` index
4. Build fieldsByName Map
5. validateRequiredFields(activeFieldDefs, values)
6. For each value entry: get fieldDef by name, throw if unknown, validateFieldValue
7. Determine labelValue (first text field by displayOrder that has a value)
8. Insert records row: { orgId, objectDefId, labelValue, isDeleted: false, createdAt, updatedAt, createdBy: ctx.viewer.authId }
9. Fan-out: writeValue for each field
10. Audit: auditLog.log with action "crm.record.created"

## T-005: updateRecord Mutation

```typescript
export const updateRecord = crmMutation
    .input({
        recordId: v.id("records"),
        values: v.any(), // Record<fieldName, value> — only changed fields
    })
    .handler(async (ctx, args) => { ... })
    .public();
```

Steps:
1. Load record, verify org ownership + not deleted
2. Load objectDef
3. Load active fieldDefs, build fieldsByName
4. For each changed value:
   a. Get fieldDef by name, throw if unknown
   b. validateFieldValue
   c. Read existing value row (for audit before/after)
   d. Delete existing value row if present
   e. Write new value row
5. Update records.updatedAt + labelValue if first text field changed
6. Audit: auditLog.logChange with before/after values, generateDiff: true

## T-006: deleteRecord Mutation

```typescript
export const deleteRecord = crmMutation
    .input({ recordId: v.id("records") })
    .handler(async (ctx, args) => { ... })
    .public();
```

Steps:
1. Load record, verify org ownership
2. Soft-delete: patch isDeleted=true, updatedAt=now
3. Do NOT delete value rows (retained for audit/undo)
4. Audit: auditLog.log with action "crm.record.deleted", severity "warning"

## Audit Patterns (from objectDefs.ts)

### Simple event:
```typescript
await auditLog.log(ctx, {
    action: "crm.record.created",
    actorId: ctx.viewer.authId,
    resourceType: "records",
    resourceId: recordId,
    severity: "info",
    metadata: { objectDefId, orgId },
});
```

### Change with diff:
```typescript
await auditLog.logChange(ctx, {
    action: "crm.record.updated",
    actorId: ctx.viewer.authId,
    resourceType: "records",
    resourceId: args.recordId,
    before: beforeValues,
    after: afterValues,
    generateDiff: true,
    severity: "info",
});
```

## Import Pattern (match objectDefs.ts)
```typescript
import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { auditLog } from "../auditLog";
import { crmMutation } from "../fluent";
import { fieldTypeToTable } from "./valueRouter";
import { validateFieldValue, validateRequiredFields } from "./fieldValidation";
```

## Performance Target
Record creation with 10 fields: 1 (records) + 10 (values) + 1 (audit) = 12 writes. Must be < 15.

## Constraints
- NEVER use `any` in internal code — `v.any()` for Convex validator is OK, cast to `Record<string, unknown>` internally
- In writeValue, use type-specific assertions (e.g., `as string`, `as number`) in each switch case branch after the type is narrowed by `fieldTypeToTable()`
- Audit action names use dot-notation: `crm.record.created` (matching `crm.object.created` convention)
