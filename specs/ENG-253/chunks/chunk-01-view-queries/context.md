# Chunk 01 Context: View Queries Foundation

## What You're Building

A new file `convex/crm/viewQueries.ts` that is the query layer for the view engine. It loads records according to view definitions, applying view filters and sort, and returns data shaped for table or kanban rendering.

## Deliverables

### T-001: Export shared helpers from `convex/crm/recordQueries.ts`

Add `export` keyword to these functions/constants (they already exist but are module-private):

```typescript
// Functions to export:
export async function readValuesFromTable(...)
export async function assembleRecordFields(...)
export async function assembleRecords(...)
export function matchesFilter(...)
export function applyFilters(...)
export function applySort(...)
export async function loadActiveFieldDefs(...)

// Constants to export:
export const FILTERED_QUERY_CAP = ...
```

**Important:** Do NOT change the function signatures or logic. Only add `export`.

### T-002: Export shared helpers from `convex/crm/records.ts`

Add `export` keyword to these functions:

```typescript
export async function writeValue(...)
export async function readExistingValue(...)
```

### T-003: Create `convex/crm/viewQueries.ts` with `queryViewRecords`

```typescript
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { crmQuery } from "../fluent";
import {
  assembleRecords,
  applyFilters,
  applySort,
  loadActiveFieldDefs,
  FILTERED_QUERY_CAP,
} from "./recordQueries";
import type { UnifiedRecord, RecordFilter } from "./types";

// queryViewRecords is a crmQuery (any authed user with org context)
export const queryViewRecords = crmQuery
  .input({
    viewDefId: v.id("viewDefs"),
    cursor: v.optional(v.union(v.string(), v.null_())),
    limit: v.optional(v.number()),
  })
  .handler(async (ctx, args) => {
    const orgId = ctx.viewer.orgId;
    if (!orgId) throw new ConvexError("Org context required");

    // 1. Load viewDef — verify org ownership
    const viewDef = await ctx.db.get(args.viewDefId);
    if (!viewDef || viewDef.orgId !== orgId) {
      throw new ConvexError("View not found or access denied");
    }

    // 2. Check needsRepair (REQ-163)
    if (viewDef.needsRepair) {
      throw new ConvexError(
        "This view needs repair — a bound field has been deactivated. " +
        "Please rebind or delete this view before querying."
      );
    }

    // 3. Load view configuration
    const viewFields = await ctx.db
      .query("viewFields")
      .withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
      .collect();
    const viewFilters = await ctx.db
      .query("viewFilters")
      .withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
      .collect();

    // 4. Load fieldDefs
    const activeFieldDefs = await loadActiveFieldDefs(ctx, viewDef.objectDefId);

    // 5. Dispatch by viewType
    switch (viewDef.viewType) {
      case "table":
        return queryTableView(ctx, { viewDef, viewFields, viewFilters, activeFieldDefs, ...args });
      case "kanban":
        return queryKanbanView(ctx, { viewDef, viewFields, viewFilters, activeFieldDefs, ...args });
      case "calendar":
        throw new ConvexError("Calendar views not yet implemented (see ENG-254)");
    }
  })
  .public();
```

### T-004: Implement `queryTableView` internal helper

```typescript
// Internal helper — NOT a Convex function, just a plain async function
async function queryTableView(ctx: QueryCtx, opts: {
  viewDef: Doc<"viewDefs">;
  viewFields: Doc<"viewFields">[];
  viewFilters: Doc<"viewFilters">[];
  activeFieldDefs: Doc<"fieldDefs">[];
  cursor?: string | null;
  limit?: number;
}) {
  const { viewDef, viewFields, viewFilters, activeFieldDefs } = opts;
  const orgId = viewDef.orgId;
  const pageSize = opts.limit ?? 25;

  // Build fieldDefsById for filter/sort
  const fieldDefsById = new Map(activeFieldDefs.map((fd) => [fd._id.toString(), fd]));

  // Visible fields sorted by displayOrder
  const visibleViewFields = viewFields
    .filter((vf) => vf.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // Build column definitions
  const columns = visibleViewFields.map((vf) => {
    const fd = fieldDefsById.get(vf.fieldDefId.toString());
    return {
      fieldDefId: vf.fieldDefId,
      name: fd?.name ?? "",
      label: fd?.label ?? "",
      fieldType: fd?.fieldType ?? "text",
      width: vf.width,
      isVisible: vf.isVisible,
      displayOrder: vf.displayOrder,
    };
  });

  // Convert viewFilters to RecordFilter[]
  const filters: RecordFilter[] = viewFilters.map((vf) => ({
    fieldDefId: vf.fieldDefId,
    operator: vf.operator as RecordFilter["operator"],
    value: vf.value ? parseFilterValue(vf.value) : undefined,
  }));

  // Load records — collect all for this object, capped
  const allRecords = await ctx.db
    .query("records")
    .withIndex("by_org_object", (q) =>
      q.eq("orgId", orgId).eq("objectDefId", viewDef.objectDefId)
    )
    .filter((q) => q.eq(q.field("isDeleted"), false))
    .take(FILTERED_QUERY_CAP);

  // Assemble field values
  const assembled = await assembleRecords(ctx, allRecords, activeFieldDefs);

  // Apply view filters as post-filter
  const filtered = applyFilters(assembled, filters, fieldDefsById);

  // Apply sort (default: createdAt desc if no sort configured)
  // viewDefs don't store sort config — sort is passed per-query or defaults
  const sorted = filtered;

  // Offset-based pagination
  let offset = 0;
  if (opts.cursor) {
    const cursorBody = opts.cursor.startsWith("offset:")
      ? opts.cursor.slice("offset:".length)
      : opts.cursor;
    offset = Number.parseInt(cursorBody, 10) || 0;
  }

  const page = sorted.slice(offset, offset + pageSize);
  const nextOffset = offset + pageSize;
  const isDone = nextOffset >= sorted.length;

  // Filter record fields to only visible fields
  const visibleFieldNames = new Set(columns.map((c) => c.name));
  const rows = page.map((record) => ({
    ...record,
    fields: Object.fromEntries(
      Object.entries(record.fields).filter(([key]) => visibleFieldNames.has(key))
    ),
  }));

  return {
    columns,
    rows,
    totalCount: filtered.length,
    cursor: isDone ? null : `offset:${nextOffset}`,
  };
}
```

### T-005: Implement `queryKanbanView` internal helper

```typescript
async function queryKanbanView(ctx: QueryCtx, opts: {
  viewDef: Doc<"viewDefs">;
  viewFields: Doc<"viewFields">[];
  viewFilters: Doc<"viewFilters">[];
  activeFieldDefs: Doc<"fieldDefs">[];
}) {
  const { viewDef, viewFields, viewFilters, activeFieldDefs } = opts;
  const fieldDefsById = new Map(activeFieldDefs.map((fd) => [fd._id.toString(), fd]));

  // Load kanban groups
  const kanbanGroups = await ctx.db
    .query("viewKanbanGroups")
    .withIndex("by_view", (q) => q.eq("viewDefId", viewDef._id))
    .collect();
  const sortedGroups = kanbanGroups.sort((a, b) => a.displayOrder - b.displayOrder);

  // Load bound field def
  if (!viewDef.boundFieldId) {
    throw new ConvexError("Kanban view missing bound field");
  }
  const boundFieldDef = await ctx.db.get(viewDef.boundFieldId);
  if (!boundFieldDef) {
    throw new ConvexError("Bound field not found");
  }

  // Convert viewFilters to RecordFilter[]
  const filters: RecordFilter[] = viewFilters.map((vf) => ({
    fieldDefId: vf.fieldDefId,
    operator: vf.operator as RecordFilter["operator"],
    value: vf.value ? parseFilterValue(vf.value) : undefined,
  }));

  // For each kanban group, query records
  const groups = await Promise.all(
    sortedGroups.map(async (group) => {
      let recordIds: Id<"records">[];

      if (group.optionValue === "__no_value__") {
        // Records where the bound field has no value
        // Load all records for object, then filter out those with a value for the bound field
        const allRecords = await ctx.db
          .query("records")
          .withIndex("by_org_object", (q) =>
            q.eq("orgId", viewDef.orgId).eq("objectDefId", viewDef.objectDefId)
          )
          .filter((q) => q.eq(q.field("isDeleted"), false))
          .take(FILTERED_QUERY_CAP);

        // Find which records DO have a value for the bound field
        const recordsWithValue = new Set<string>();
        // Check select values table
        const selectValues = await ctx.db
          .query("recordValuesSelect")
          .withIndex("by_object_field_value")
          // Can't range-scan for "all values" — instead query by field
          // Use a different approach: check each record
          .collect(); // This would be expensive...

        // BETTER APPROACH: Load all records, assemble, check bound field value
        const assembled = await assembleRecords(ctx, allRecords, activeFieldDefs);
        const noValueRecords = assembled.filter(
          (r) => r.fields[boundFieldDef.name] === undefined || r.fields[boundFieldDef.name] === null
        );

        const filteredRecords = applyFilters(noValueRecords, filters, fieldDefsById);

        return {
          groupId: group._id,
          label: "No Value",
          color: "",
          records: filteredRecords,
          count: filteredRecords.length,
          isCollapsed: group.isCollapsed,
        };
      }

      // Standard group: range scan recordValuesSelect by object + field + value
      if (boundFieldDef.fieldType === "select") {
        const valueRows = await ctx.db
          .query("recordValuesSelect")
          .withIndex("by_object_field_value", (q) =>
            q
              .eq("objectDefId", viewDef.objectDefId)
              .eq("fieldDefId", viewDef.boundFieldId!)
              .eq("value", group.optionValue)
          )
          .collect();

        // Load the actual record docs (need to verify not deleted + assemble)
        const recordDocs = await Promise.all(
          valueRows.map((vr) => ctx.db.get(vr.recordId))
        );
        const validRecords = recordDocs.filter(
          (r): r is Doc<"records"> => r !== null && !r.isDeleted && r.orgId === viewDef.orgId
        );

        const assembled = await assembleRecords(ctx, validRecords, activeFieldDefs);
        const filteredRecords = applyFilters(assembled, filters, fieldDefsById);

        // Find the option label/color from the fieldDef options
        const option = boundFieldDef.options?.find((o) => o.value === group.optionValue);

        return {
          groupId: group._id,
          label: option?.label ?? group.optionValue,
          color: option?.color ?? "",
          records: filteredRecords,
          count: filteredRecords.length,
          isCollapsed: group.isCollapsed,
        };
      }

      // multi_select: client-side grouping (OQ-1 decision)
      if (boundFieldDef.fieldType === "multi_select") {
        const allRecords = await ctx.db
          .query("records")
          .withIndex("by_org_object", (q) =>
            q.eq("orgId", viewDef.orgId).eq("objectDefId", viewDef.objectDefId)
          )
          .filter((q) => q.eq(q.field("isDeleted"), false))
          .take(FILTERED_QUERY_CAP);

        const assembled = await assembleRecords(ctx, allRecords, activeFieldDefs);

        // Client-side grouping: check if record's multi_select array contains group value
        const groupRecords = assembled.filter((r) => {
          const val = r.fields[boundFieldDef.name];
          return Array.isArray(val) && val.includes(group.optionValue);
        });

        const filteredRecords = applyFilters(groupRecords, filters, fieldDefsById);
        const option = boundFieldDef.options?.find((o) => o.value === group.optionValue);

        return {
          groupId: group._id,
          label: option?.label ?? group.optionValue,
          color: option?.color ?? "",
          records: filteredRecords,
          count: filteredRecords.length,
          isCollapsed: group.isCollapsed,
        };
      }

      // Fallback for unexpected field types bound to kanban
      return {
        groupId: group._id,
        label: group.optionValue,
        color: "",
        records: [] as UnifiedRecord[],
        count: 0,
        isCollapsed: group.isCollapsed,
      };
    })
  );

  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

  return {
    groups,
    totalCount,
  };
}
```

**CRITICAL**: The `__no_value__` group approach above is suboptimal — it loads ALL records, assembles them, and checks for missing values. A better approach:
1. Load all records for the object
2. Assemble all at once (shared across groups)
3. Distribute into groups based on bound field value

This avoids assembling the same records N times (once per group). Refactor to:
1. Pre-load all records + assemble once
2. Then distribute into groups

### T-006: Add `getViewSchema` query

```typescript
export const getViewSchema = crmQuery
  .input({ viewDefId: v.id("viewDefs") })
  .handler(async (ctx, args) => {
    const orgId = ctx.viewer.orgId;
    if (!orgId) throw new ConvexError("Org context required");

    const viewDef = await ctx.db.get(args.viewDefId);
    if (!viewDef || viewDef.orgId !== orgId) {
      throw new ConvexError("View not found or access denied");
    }

    // Load viewFields + fieldDefs
    const viewFields = await ctx.db
      .query("viewFields")
      .withIndex("by_view", (q) => q.eq("viewDefId", args.viewDefId))
      .collect();

    const activeFieldDefs = await loadActiveFieldDefs(ctx, viewDef.objectDefId);
    const fieldDefsById = new Map(activeFieldDefs.map((fd) => [fd._id.toString(), fd]));

    // Load fieldCapabilities for sort capability check
    const capabilities = await ctx.db
      .query("fieldCapabilities")
      .withIndex("by_object_capability", (q) =>
        q.eq("objectDefId", viewDef.objectDefId).eq("capability", "sort")
      )
      .collect();
    const sortableFieldIds = new Set(capabilities.map((c) => c.fieldDefId.toString()));

    // Build column definitions
    const columns = viewFields
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((vf) => {
        const fd = fieldDefsById.get(vf.fieldDefId.toString());
        return {
          fieldDefId: vf.fieldDefId,
          name: fd?.name ?? "",
          label: fd?.label ?? "",
          fieldType: fd?.fieldType ?? "text",
          width: vf.width,
          isVisible: vf.isVisible,
          displayOrder: vf.displayOrder,
          hasSortCapability: sortableFieldIds.has(vf.fieldDefId.toString()),
        };
      });

    return {
      columns,
      viewType: viewDef.viewType,
      needsRepair: viewDef.needsRepair,
    };
  })
  .public();
```

## Helper function needed

```typescript
// Parse filter value from string (viewFilters store value as optional string)
function parseFilterValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value; // plain string
  }
}
```

## Key Schema Reference

### viewDefs
```
orgId: string, objectDefId: Id<"objectDefs">, name: string,
viewType: "table" | "kanban" | "calendar",
boundFieldId?: Id<"fieldDefs">, isDefault: boolean, needsRepair: boolean,
createdAt: number, updatedAt: number, createdBy: string
Indexes: by_object [objectDefId], by_org [orgId]
```

### viewFields
```
viewDefId: Id<"viewDefs">, fieldDefId: Id<"fieldDefs">,
isVisible: boolean, displayOrder: number, width?: number
Indexes: by_view [viewDefId], by_field [fieldDefId]
```

### viewFilters
```
viewDefId: Id<"viewDefs">, fieldDefId: Id<"fieldDefs">,
operator: FilterOperator, value?: string, logicalOperator?: "and" | "or"
Indexes: by_view [viewDefId], by_field [fieldDefId]
```

### viewKanbanGroups
```
viewDefId: Id<"viewDefs">, fieldDefId: Id<"fieldDefs">,
optionValue: string, displayOrder: number, isCollapsed: boolean
Indexes: by_view [viewDefId], by_field [fieldDefId]
```

### recordValuesSelect
```
recordId: Id<"records">, fieldDefId: Id<"fieldDefs">,
objectDefId: Id<"objectDefs">, value: string
Indexes: by_record [recordId], by_record_field [recordId, fieldDefId],
         by_object_field_value [objectDefId, fieldDefId, value]
```

### recordValuesMultiSelect
```
recordId: Id<"records">, fieldDefId: Id<"fieldDefs">,
objectDefId: Id<"objectDefs">, value: string[]
Indexes: by_record [recordId], by_record_field [recordId, fieldDefId]
NO by_object_field_value — arrays aren't indexable
```

## Existing Types (from convex/crm/types.ts)

```typescript
export type UnifiedRecord = {
  _id: string;
  _kind: "record" | "native";
  objectDefId: Id<"objectDefs">;
  fields: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type RecordFilter = {
  fieldDefId: Id<"fieldDefs">;
  operator: "eq" | "gt" | "lt" | "gte" | "lte" | "contains" | "starts_with" | "is_any_of" | "is_true" | "is_false";
  value: unknown;
};
```

## Middleware Reference

```typescript
// Data Plane queries (any authed user with org context)
export const crmQuery = authedQuery.use(requireOrgContext);
export const crmMutation = authedMutation.use(requireOrgContext);
```

The Viewer type includes: `authId`, `email`, `orgId`, `orgName`, `role`, `roles`, `permissions`, `isFairLendAdmin`.

## Performance Optimization Notes

For kanban view, avoid N+1 assembly:
1. Load ALL records for the object once
2. Assemble ALL records once
3. Then distribute into groups based on bound field value

For the `__no_value__` group:
- After distributing, records not assigned to any standard group go to `__no_value__`

## Constraints
- Use `crmQuery` (NOT `crmAdminQuery`) — these are user-facing data plane reads
- All queries must verify `viewDef.orgId === ctx.viewer.orgId` (REQ-166)
- Reject `needsRepair` views with clear error (REQ-163)
- No `any` types
- Reuse helpers from recordQueries.ts — don't re-implement fan-out assembly
