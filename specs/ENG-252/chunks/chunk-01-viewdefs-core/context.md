# Chunk 1 Context: Filter Operator Validation + View Defs CRUD

## Files to Create
1. `convex/crm/filterOperatorValidation.ts` (NEW)
2. `convex/crm/viewDefs.ts` (NEW)

## Schema (from convex/schema.ts)

```typescript
viewDefs: defineTable({
    orgId: v.string(),
    objectDefId: v.id("objectDefs"),
    name: v.string(),
    viewType: viewTypeValidator,
    boundFieldId: v.optional(v.id("fieldDefs")),
    isDefault: v.boolean(),
    needsRepair: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.string(),
})
    .index("by_object", ["objectDefId"])
    .index("by_org", ["orgId"]),

viewFields: defineTable({
    viewDefId: v.id("viewDefs"),
    fieldDefId: v.id("fieldDefs"),
    isVisible: v.boolean(),
    displayOrder: v.number(),
    width: v.optional(v.number()),
})
    .index("by_view", ["viewDefId"])
    .index("by_field", ["fieldDefId"]),

viewFilters: defineTable({
    viewDefId: v.id("viewDefs"),
    fieldDefId: v.id("fieldDefs"),
    operator: filterOperatorValidator,
    value: v.optional(v.string()),
    logicalOperator: v.optional(logicalOperatorValidator),
})
    .index("by_view", ["viewDefId"])
    .index("by_field", ["fieldDefId"]),

viewKanbanGroups: defineTable({
    viewDefId: v.id("viewDefs"),
    fieldDefId: v.id("fieldDefs"),
    optionValue: v.string(),
    displayOrder: v.number(),
    isCollapsed: v.boolean(),
})
    .index("by_view", ["viewDefId"])
    .index("by_field", ["fieldDefId"]),
```

## Validators (from convex/crm/validators.ts)

```typescript
export const viewTypeValidator = v.union(
    v.literal("table"),
    v.literal("kanban"),
    v.literal("calendar")
);

export const filterOperatorValidator = v.union(
    v.literal("contains"),
    v.literal("equals"),
    v.literal("starts_with"),
    v.literal("eq"),
    v.literal("gt"),
    v.literal("lt"),
    v.literal("gte"),
    v.literal("lte"),
    v.literal("before"),
    v.literal("after"),
    v.literal("between"),
    v.literal("is"),
    v.literal("is_not"),
    v.literal("is_any_of"),
    v.literal("is_true"),
    v.literal("is_false")
);

export const logicalOperatorValidator = v.union(
    v.literal("and"),
    v.literal("or")
);

export const selectOptionValidator = v.object({
    value: v.string(),
    label: v.string(),
    color: v.string(),
    order: v.number(),
});

export const fieldTypeValidator = v.union(
    v.literal("text"),
    v.literal("number"),
    v.literal("boolean"),
    v.literal("date"),
    v.literal("datetime"),
    v.literal("select"),
    v.literal("multi_select"),
    v.literal("email"),
    v.literal("phone"),
    v.literal("url"),
    v.literal("currency"),
    v.literal("percentage"),
    v.literal("rich_text"),
    v.literal("user_ref")
);
```

## Imports Pattern (from existing objectDefs.ts / fieldDefs.ts)

```typescript
import { ConvexError, v } from "convex/values";
import { auditLog } from "../auditLog";
import { crmAdminMutation, crmAdminQuery } from "../fluent";
import { viewTypeValidator } from "./validators";
```

## Audit Log Usage (from convex/auditLog.ts)

```typescript
import { AuditLog } from "convex-audit-log";
import { components } from "./_generated/api";

export const auditLog = new AuditLog(components.auditLog, {
    piiFields: ["email", "phone", "ssn", "password", "phoneNumber", "borrowerEmail", "borrowerPhone", "borrowerSsn"],
});

// Simple event:
await auditLog.log(ctx, {
    action: "crm.view.created",
    actorId: ctx.viewer.authId,
    resourceType: "viewDefs",
    resourceId: viewDefId,
    severity: "info",
    metadata: { name: args.name, viewType: args.viewType, orgId },
});

// With diff:
await auditLog.logChange(ctx, {
    action: "crm.view.updated",
    actorId: ctx.viewer.authId,
    resourceType: "viewDefs",
    resourceId: args.viewDefId,
    before,
    after,
    generateDiff: true,
    severity: "info",
});
```

## Middleware Chains (from convex/fluent.ts)

```typescript
// CRM admin chains (auth → org context → admin role):
export const crmAdminMutation = authedMutation.use(requireOrgContext).use(requireAdmin);
export const crmAdminQuery = authedQuery.use(requireOrgContext).use(requireAdmin);

// The ctx.viewer shape:
interface Viewer {
    authId: string;
    email: string | undefined;
    firstName: string | undefined;
    isFairLendAdmin: boolean;
    lastName: string | undefined;
    orgId: string | undefined;
    orgName: string | undefined;
    permissions: Set<string>;
    role: string | undefined;
    roles: Set<string>;
}
```

## Shared Patterns (follow exactly)

### Org-scoping guard (every mutation/query)
```typescript
const orgId = ctx.viewer.orgId;
if (!orgId) {
    throw new ConvexError("Org context required for CRM operations");
}
```

### Ownership verification
```typescript
const viewDef = await ctx.db.get(args.viewDefId);
if (!viewDef || viewDef.orgId !== orgId) {
    throw new ConvexError("View not found or access denied");
}
```

## T-001: filterOperatorValidation.ts

Create `convex/crm/filterOperatorValidation.ts` — pure function that maps field types to their valid filter operators.

```typescript
import type { Doc } from "../_generated/dataModel";

type FieldType = Doc<"fieldDefs">["fieldType"];
type FilterOperator = Doc<"viewFilters">["operator"];

const OPERATOR_MAP: Record<string, readonly FilterOperator[]> = {
    // Text-like types
    text: ["contains", "equals", "starts_with"],
    email: ["contains", "equals", "starts_with"],
    phone: ["contains", "equals", "starts_with"],
    url: ["contains", "equals", "starts_with"],
    rich_text: ["contains", "equals", "starts_with"],
    // Numeric types
    number: ["eq", "gt", "lt", "gte", "lte"],
    currency: ["eq", "gt", "lt", "gte", "lte"],
    percentage: ["eq", "gt", "lt", "gte", "lte"],
    // Date types
    date: ["before", "after", "between"],
    datetime: ["before", "after", "between"],
    // Select types
    select: ["is", "is_not", "is_any_of"],
    multi_select: ["is", "is_not", "is_any_of"],
    // Boolean
    boolean: ["is_true", "is_false"],
    // User ref
    user_ref: ["is", "is_not"],
};

export function getValidOperators(fieldType: FieldType): readonly FilterOperator[] {
    return OPERATOR_MAP[fieldType] ?? [];
}

export function isValidOperatorForFieldType(
    operator: FilterOperator,
    fieldType: FieldType
): boolean {
    const valid = OPERATOR_MAP[fieldType];
    return valid !== undefined && (valid as readonly string[]).includes(operator);
}
```

## T-002: createView mutation

```typescript
// Input: { objectDefId, name, viewType, boundFieldId? }
// Logic:
// 1. Verify objectDef exists and belongs to org
// 2. For kanban: require boundFieldId, validate field has "kanban" capability
// 3. For calendar: require boundFieldId, validate field has "calendar" capability
// 4. For table: boundFieldId is optional
// 5. Insert viewDef with needsRepair: false, isDefault: false
// 6. Auto-add all active fieldDefs as viewFields (visible, ordered by displayOrder)
// 7. For kanban: auto-create viewKanbanGroups from select field options + "No Value" group
// 8. Audit log
// Returns: viewDefId
```

**Critical capability validation:**
```typescript
if (args.viewType === "kanban") {
    if (!args.boundFieldId) {
        throw new ConvexError("Kanban views require a boundFieldId (select or multi_select field)");
    }
    const cap = await ctx.db
        .query("fieldCapabilities")
        .withIndex("by_object_capability", q =>
            q.eq("objectDefId", args.objectDefId).eq("capability", "kanban")
        )
        .filter(q => q.eq(q.field("fieldDefId"), args.boundFieldId))
        .first();
    if (!cap) {
        throw new ConvexError("Bound field does not have kanban capability");
    }
}
// Same pattern for calendar with "calendar" capability
```

**Auto-populate viewFields (for all view types including table):**
```typescript
// Load all active fieldDefs for this object, ordered by displayOrder
const activeFields = await ctx.db
    .query("fieldDefs")
    .withIndex("by_object", q => q.eq("objectDefId", args.objectDefId))
    .collect();
const sortedActiveFields = activeFields
    .filter(f => f.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);

for (let i = 0; i < sortedActiveFields.length; i++) {
    await ctx.db.insert("viewFields", {
        viewDefId,
        fieldDefId: sortedActiveFields[i]._id,
        isVisible: true,
        displayOrder: i,
    });
}
```

**Kanban group auto-creation (only for kanban viewType):**
```typescript
// Load the bound field's select options
const fieldDef = await ctx.db.get(args.boundFieldId);
const options = fieldDef.options ?? [];
for (let i = 0; i < options.length; i++) {
    await ctx.db.insert("viewKanbanGroups", {
        viewDefId,
        fieldDefId: args.boundFieldId,
        optionValue: options[i].value,
        displayOrder: i,
        isCollapsed: false,
    });
}
// "No Value" group always last
await ctx.db.insert("viewKanbanGroups", {
    viewDefId,
    fieldDefId: args.boundFieldId,
    optionValue: "__no_value__",
    displayOrder: options.length,
    isCollapsed: false,
});
```

## T-003: updateView mutation

```typescript
// Input: { viewDefId, name?, boundFieldId? }
// Logic:
// 1. Verify viewDef exists and belongs to org
// 2. If boundFieldId changes AND view is kanban/calendar:
//    - Validate new field has required capability
//    - For kanban: delete old viewKanbanGroups, create new ones from new field's options
// 3. Patch viewDef (name, boundFieldId, updatedAt)
// 4. Audit with diff (auditLog.logChange)
```

## T-004: deleteView mutation

```typescript
// Input: { viewDefId }
// Logic:
// 1. Verify viewDef exists and belongs to org
// 2. PREVENT deletion of default view (isDefault === true) → throw ConvexError
// 3. Hard delete all child entities:
//    - All viewFields where viewDefId matches (query by_view index)
//    - All viewFilters where viewDefId matches (query by_view index)
//    - All viewKanbanGroups where viewDefId matches (query by_view index)
// 4. Hard delete the viewDef itself
// 5. Audit log
```

## T-005: duplicateView mutation

```typescript
// Input: { viewDefId, newName }
// Logic:
// 1. Verify source viewDef exists and belongs to org
// 2. Insert new viewDef: copy all fields EXCEPT _id, isDefault=false, needsRepair=source.needsRepair, name=newName
// 3. Clone all viewFields from source → new viewDefId
// 4. Clone all viewFilters from source → new viewDefId
// 5. Clone all viewKanbanGroups from source → new viewDefId
// 6. Audit log
// Returns: newViewDefId
```

## T-006: listViews query

```typescript
// Input: { objectDefId }
// Logic:
// 1. Verify objectDef belongs to org
// 2. Query viewDefs by_object index
// 3. Sort: default view first, then by createdAt
// Returns: viewDef[]
```

## T-007: getView query

```typescript
// Input: { viewDefId }
// Logic:
// 1. Fetch viewDef by ID
// 2. Verify belongs to org
// Returns: viewDef
```

## DO NOT RE-IMPLEMENT
- Auto-add new fields to default view on field creation (already in fieldDefs.createField)
- View integrity check on field deactivation (already in fieldDefs.deactivateField)

## Codebase Pattern Reference: objectDefs.ts createObject

This is the existing pattern for CRM admin mutations. Follow this EXACTLY:

```typescript
export const createObject = crmAdminMutation
    .input({
        name: v.string(),
        singularLabel: v.string(),
        pluralLabel: v.string(),
        icon: v.string(),
        description: v.optional(v.string()),
        isSystem: v.optional(v.boolean()),
        nativeTable: v.optional(v.string()),
    })
    .handler(async (ctx, args) => {
        const orgId = ctx.viewer.orgId;
        if (!orgId) {
            throw new ConvexError("Org context required for CRM operations");
        }
        const now = Date.now();
        // ... validation ...
        const objectDefId = await ctx.db.insert("objectDefs", { ... });
        // ... audit ...
        return objectDefId;
    })
    .public();
```

Key patterns:
- Use `crmAdminMutation.input({...}).handler(async (ctx, args) => {...}).public()`
- Use `crmAdminQuery.input({...}).handler(async (ctx, args) => {...}).public()` for queries
- Queries with no input use `crmAdminQuery.handler(async (ctx) => {...}).public()`
- Always start handler with orgId check
- Use `ctx.viewer.authId` for createdBy and audit actorId
- Use `Date.now()` for timestamps
