# Chunk 2 Context: View Fields + View Filters + Kanban Groups CRUD

## Files to Create
1. `convex/crm/viewFields.ts` (NEW)
2. `convex/crm/viewFilters.ts` (NEW)
3. `convex/crm/viewKanbanGroups.ts` (NEW)

## Schema (from convex/schema.ts)

```typescript
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
export const filterOperatorValidator = v.union(
    v.literal("contains"), v.literal("equals"), v.literal("starts_with"),
    v.literal("eq"), v.literal("gt"), v.literal("lt"), v.literal("gte"), v.literal("lte"),
    v.literal("before"), v.literal("after"), v.literal("between"),
    v.literal("is"), v.literal("is_not"), v.literal("is_any_of"),
    v.literal("is_true"), v.literal("is_false")
);

export const logicalOperatorValidator = v.union(v.literal("and"), v.literal("or"));
```

## Filter Operator Validation (created in Chunk 1: convex/crm/filterOperatorValidation.ts)

```typescript
import type { Doc } from "../_generated/dataModel";

type FieldType = Doc<"fieldDefs">["fieldType"];
type FilterOperator = Doc<"viewFilters">["operator"];

// Maps field types to valid operators
export function getValidOperators(fieldType: FieldType): readonly FilterOperator[];
export function isValidOperatorForFieldType(operator: FilterOperator, fieldType: FieldType): boolean;
```

Use `isValidOperatorForFieldType` in viewFilters.ts to validate operator against field type.

## Imports Pattern

```typescript
import { ConvexError, v } from "convex/values";
import { auditLog } from "../auditLog";
import { crmAdminMutation, crmAdminQuery } from "../fluent";
// For viewFilters.ts:
import { filterOperatorValidator, logicalOperatorValidator } from "./validators";
import { isValidOperatorForFieldType } from "./filterOperatorValidation";
```

## Shared Patterns (follow exactly)

### Org-scoping guard (every mutation/query)
```typescript
const orgId = ctx.viewer.orgId;
if (!orgId) {
    throw new ConvexError("Org context required for CRM operations");
}
```

### Ownership verification for child entities (verify via parent viewDef)
```typescript
// For viewFields, viewFilters, viewKanbanGroups — verify through the parent viewDef:
const viewDef = await ctx.db.get(viewField.viewDefId);
if (!viewDef || viewDef.orgId !== orgId) {
    throw new ConvexError("View not found or access denied");
}
```

### Audit logging
```typescript
// Simple event:
await auditLog.log(ctx, {
    action: "crm.viewField.updated",
    actorId: ctx.viewer.authId,
    resourceType: "viewFields",
    resourceId: viewFieldId,
    severity: "info",
    metadata: { viewDefId, fieldDefId, orgId },
});
```

### Middleware chains
```typescript
// Use crmAdminMutation for admin writes, crmAdminQuery for admin reads
// Pattern: crmAdminMutation.input({...}).handler(async (ctx, args) => {...}).public()
```

## T-008: setViewFieldVisibility mutation (viewFields.ts)

```typescript
// Input: { viewDefId, fieldDefId, isVisible }
// Logic:
// 1. Verify viewDef exists and belongs to org
// 2. Find existing viewField by querying by_view index and filtering by fieldDefId
// 3. If exists: patch isVisible
// 4. If not exists: insert new viewField (visible, last displayOrder)
// 5. Audit log
```

## T-009: reorderViewFields mutation

```typescript
// Input: { viewDefId, fieldIds: Id<"fieldDefs">[] }
// Logic:
// 1. Verify viewDef exists and belongs to org
// 2. Validate fieldIds contains no duplicates
// 3. Load all viewFields for this view (by_view index)
// 4. For each fieldId in the provided order, find the matching viewField and update its displayOrder
// 5. Audit log
```

## T-010: setViewFieldWidth mutation

```typescript
// Input: { viewDefId, fieldDefId, width }
// Logic:
// 1. Verify viewDef exists and belongs to org
// 2. Find viewField by querying by_view index and filtering by fieldDefId
// 3. If not found: throw ConvexError
// 4. Patch width
// 5. Audit log
```

## T-011: listViewFields query

```typescript
// Input: { viewDefId }
// Logic:
// 1. Verify viewDef exists and belongs to org
// 2. Query viewFields by_view index
// 3. Sort by displayOrder
// Returns: viewField[]
```

## T-012: addViewFilter mutation (viewFilters.ts)

```typescript
// Input: { viewDefId, fieldDefId, operator, value?, logicalOperator? }
// Logic:
// 1. Verify viewDef exists and belongs to org
// 2. Verify fieldDef exists and belongs to the view's objectDef
// 3. Validate operator is valid for fieldDef.fieldType using isValidOperatorForFieldType()
// 4. Insert viewFilter
// 5. Audit log
// Returns: viewFilterId
```

**Operator validation:**
```typescript
const fieldDef = await ctx.db.get(args.fieldDefId);
if (!fieldDef) throw new ConvexError("Field not found");
// Verify fieldDef belongs to the same object as the view
if (fieldDef.objectDefId !== viewDef.objectDefId) {
    throw new ConvexError("Field does not belong to the view's object");
}
if (!isValidOperatorForFieldType(args.operator, fieldDef.fieldType)) {
    throw new ConvexError(
        `Operator "${args.operator}" is not valid for field type "${fieldDef.fieldType}"`
    );
}
```

## T-013: updateViewFilter mutation

```typescript
// Input: { filterId, operator?, value?, logicalOperator? }
// Logic:
// 1. Load filter by ID
// 2. Get viewDef from filter.viewDefId, verify org
// 3. If operator changes: load fieldDef, validate new operator against fieldDef.fieldType
// 4. Patch filter
// 5. Audit with diff (auditLog.logChange)
```

## T-014: removeViewFilter mutation

```typescript
// Input: { filterId }
// Logic:
// 1. Load filter by ID
// 2. Get viewDef from filter.viewDefId, verify org
// 3. Hard delete filter
// 4. Audit log
```

## T-015: listViewFilters query

```typescript
// Input: { viewDefId }
// Logic:
// 1. Verify viewDef exists and belongs to org
// 2. Query viewFilters by_view index
// Returns: viewFilter[]
```

## T-016: reorderKanbanGroups mutation (viewKanbanGroups.ts)

```typescript
// Input: { viewDefId, groupIds: Id<"viewKanbanGroups">[] }
// Logic:
// 1. Verify viewDef exists and belongs to org
// 2. Verify viewDef.viewType === "kanban"
// 3. Validate groupIds — no duplicates
// 4. Load all existing groups for this view (by_view index)
// 5. Validate all groupIds belong to this view
// 6. Update displayOrder for each group matching the new order
// 7. Audit log
```

## T-017: toggleKanbanGroupCollapse mutation

```typescript
// Input: { groupId }
// Logic:
// 1. Load group by ID
// 2. Get viewDef from group.viewDefId, verify org
// 3. Toggle isCollapsed (patch with !current value)
// 4. Audit log
```

## T-018: listKanbanGroups query

```typescript
// Input: { viewDefId }
// Logic:
// 1. Verify viewDef exists and belongs to org
// 2. Query viewKanbanGroups by_view index
// 3. Sort by displayOrder
// Returns: viewKanbanGroup[]
```

## DO NOT RE-IMPLEMENT
- Auto-add new fields to default view on field creation (already in fieldDefs.createField)
- View integrity check on field deactivation (already in fieldDefs.deactivateField)

## Codebase Pattern Reference

Follow the exact `.input().handler().public()` pattern from objectDefs.ts and fieldDefs.ts.
Use `v.id("viewDefs")`, `v.id("fieldDefs")`, `v.id("viewKanbanGroups")` etc. for ID validators.
