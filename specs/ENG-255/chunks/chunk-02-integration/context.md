# Chunk 02 Context: Integration

## What Exists After Chunk 01
- `convex/crm/systemAdapters/columnResolver.ts` — resolveColumnPath()
- `convex/crm/systemAdapters/queryAdapter.ts` — queryNativeTable(), queryNativeRecords()
- `convex/crm/types.ts` — UnifiedRecord type (from ENG-251 merge)
- `convex/crm/recordQueries.ts` — with 3 ENG-255 stubs to replace

## Current Stubs in recordQueries.ts (3 locations)

### 1. queryRecords handler (~line where objectDef.isSystem check is)
```typescript
// Current:
if (objectDef.isSystem) {
  throw new ConvexError("System object queries not yet implemented (see ENG-255)");
}

// Replace with:
if (objectDef.isSystem && objectDef.nativeTable) {
  const nativeRecords = await queryNativeRecords(
    ctx, objectDef, activeFieldDefs, orgId, args.paginationOpts.numItems
  );
  return {
    records: nativeRecords,
    continueCursor: null,
    isDone: true,
    truncated: false,
  };
}
```

### 2. getRecord handler
```typescript
// Current:
if (objectDef.isSystem) {
  throw new ConvexError("System object queries not yet implemented (see ENG-255)");
}

// Replace with:
if (objectDef.isSystem) {
  throw new ConvexError("getRecord for system objects not yet implemented — use queryRecords");
}
```
Note: getRecord takes a recordId (Id<"records">) which doesn't apply to native docs.
For v1, we keep the stub but with a clearer message. Full getRecord for native entities
requires a getNativeRecord function that accepts (nativeTable, nativeId) — deferred to ENG-256.

### 3. searchRecords handler
```typescript
// Current:
if (objectDef.isSystem) {
  throw new ConvexError("System object queries not yet implemented (see ENG-255)");
}

// Replace with:
if (objectDef.isSystem) {
  // Native tables don't have a search index on labelValue.
  // Return empty results for v1 — full native search is a future enhancement.
  return [];
}
```

## Import to Add
```typescript
import { queryNativeRecords } from "./systemAdapters/queryAdapter";
```

## Key Contract: UnifiedRecord Shape
Both EAV and native paths must return the same shape:
```typescript
{
  _id: string,          // doc._id cast to string
  _kind: "record" | "native",
  objectDefId: Id<"objectDefs">,
  fields: Record<string, unknown>,
  createdAt: number,
  updatedAt: number,
}
```

## Quality Gate Commands
```bash
bun check          # auto-format + lint (run FIRST, it fixes things)
bun typecheck      # TypeScript type checking
bunx convex codegen # Convex codegen (regenerate types if schema touched)
```

## Rules
- Run `bun check` FIRST — it auto-fixes formatting
- No `any` types
- Don't modify code beyond the 3 stub replacements + the import
