# Chunk 02 Context: Kanban Mutation + OQ-1 Documentation + Quality Gate

## What You're Building

Adding `moveKanbanRecord` mutation to `convex/crm/viewQueries.ts`, documenting the OQ-1 multi-select kanban decision, and running quality checks.

## T-007: moveKanbanRecord Mutation

A thin view-aware wrapper around the existing record value update pattern. When a user drags a kanban card from one column to another, this mutation updates the bound field value.

```typescript
import { crmMutation } from "../fluent";
import { auditLog } from "../auditLog";
import { readExistingValue, writeValue } from "./records";

export const moveKanbanRecord = crmMutation
  .input({
    recordId: v.id("records"),
    viewDefId: v.id("viewDefs"),
    targetGroupValue: v.string(),
  })
  .handler(async (ctx, args) => {
    const orgId = ctx.viewer.orgId;
    if (!orgId) throw new ConvexError("Org context required");

    // 1. Load viewDef — verify it's kanban + org ownership
    const viewDef = await ctx.db.get(args.viewDefId);
    if (!viewDef || viewDef.orgId !== orgId) {
      throw new ConvexError("View not found or access denied");
    }
    if (viewDef.viewType !== "kanban") {
      throw new ConvexError("moveKanbanRecord only works on kanban views");
    }
    if (!viewDef.boundFieldId) {
      throw new ConvexError("Kanban view missing bound field");
    }

    // 2. Load record — verify org ownership + not deleted
    const record = await ctx.db.get(args.recordId);
    if (!record || record.orgId !== orgId || record.isDeleted) {
      throw new ConvexError("Record not found or access denied");
    }

    // 3. Load bound field def
    const boundFieldDef = await ctx.db.get(viewDef.boundFieldId);
    if (!boundFieldDef) {
      throw new ConvexError("Bound field not found");
    }

    // 4. Read existing value for audit diff
    const existingRow = await readExistingValue(ctx, args.recordId, boundFieldDef);
    const beforeValue = existingRow ? existingRow.value : null;

    // 5. Delete old value row if present
    if (existingRow) {
      await ctx.db.delete(existingRow._id);
    }

    // 6. Write new value
    // For "__no_value__" target, we just delete (don't write)
    if (args.targetGroupValue !== "__no_value__") {
      await writeValue(ctx, args.recordId, boundFieldDef, args.targetGroupValue);
    }

    // 7. Update record timestamp
    await ctx.db.patch(args.recordId, { updatedAt: Date.now() });

    // 8. Audit with diff
    await auditLog.logChange(ctx, {
      action: "crm.record.updated",
      actorId: ctx.viewer.authId,
      resourceType: "records",
      resourceId: args.recordId,
      before: { [boundFieldDef.name]: beforeValue },
      after: { [boundFieldDef.name]: args.targetGroupValue === "__no_value__" ? null : args.targetGroupValue },
      generateDiff: true,
      severity: "info",
    });
  })
  .public();
```

### Key Details:
- Uses `crmMutation` (data-plane, not admin-only)
- `readExistingValue` and `writeValue` are imported from `./records` (exported in T-002)
- `readExistingValue` signature: `(ctx: MutationCtx, recordId: Id<"records">, fieldDef: Doc<"fieldDefs">)` → returns the value row doc or null
- `writeValue` signature: `(ctx: MutationCtx, recordId: Id<"records">, fieldDef: Doc<"fieldDefs">, value: unknown)` → writes to correct typed table
- For `__no_value__` target, only delete the existing row (leave the field empty)
- `auditLog.logChange` takes `{ action, actorId, resourceType, resourceId, before, after, generateDiff, severity }`

### Important: MutationCtx vs QueryCtx
The `readExistingValue` and `writeValue` functions use `MutationCtx` (they access `ctx.db` for writes). Since `moveKanbanRecord` is a mutation, `ctx` is `MutationCtx` — this is compatible.

## T-008: Document OQ-1 Decision

Add this comment block near the top of `viewQueries.ts`:

```typescript
// ── OQ-1: Multi-select kanban grouping ────────────────────────────────
// Decision: Client-side grouping for v1.
// multi_select fields have "kanban" capability (per metadataCompiler),
// but the recordValuesMultiSelect table stores arrays which aren't
// indexable by individual values in Convex.
// For v1: load all records, group client-side by iterating values array.
// A record with values: ["new", "hot"] appears in both "new" and "hot" columns.
// For v2: consider materializing individual select values into a
// dedicated index table for server-side grouping if perf requires it.
```

## T-009: Quality Gate

Run these commands in order:
```shell
bun check           # lint, format, auto-fix
bun typecheck       # type checking
bunx convex codegen # regenerate Convex types
```

Fix any issues that arise. Common issues:
- Import paths
- Type mismatches between QueryCtx and MutationCtx
- Missing exports
- Unused imports

## Existing records.ts patterns (for reference)

The `updateRecord` mutation in `records.ts` follows this pattern for single-field updates:
1. Load record + verify org
2. Load fieldDefs, build fieldsByName
3. For each field: validate → readExistingValue → delete old → writeValue new
4. Update record.updatedAt
5. auditLog.logChange with before/after diff

`moveKanbanRecord` is a specialized version that:
- Only updates ONE field (the bound field)
- Gets the field from the viewDef (not from user input)
- Validates it's a kanban view
- Uses the same readExistingValue/writeValue/audit pattern

## Constraints
- Use `crmMutation` (NOT `crmAdminMutation`) — data plane operation
- Verify org ownership on viewDef AND record
- Emit audit diff (delegated to auditLog.logChange)
- No `any` types
- `readExistingValue` and `writeValue` must already be exported from T-002
