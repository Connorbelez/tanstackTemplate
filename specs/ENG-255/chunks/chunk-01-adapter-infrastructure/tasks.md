# Chunk 01: Adapter Infrastructure

## T-001: Merge main branch
- Merge main into working branch to get ENG-251 code (convex/crm/recordQueries.ts, convex/crm/types.ts)
- Resolve any conflicts (unlikely — eng-252 and eng-251 don't touch same files)
- Verify files exist after merge

## T-002: Create columnResolver.ts
- File: `convex/crm/systemAdapters/columnResolver.ts`
- Pure function: `resolveColumnPath(nativeDoc, fieldDef)`
- Handles nested paths, type coercion (string dates → unix ms), pass-through for string IDs
- Returns `undefined` for missing paths

## T-003: Create queryAdapter.ts
- File: `convex/crm/systemAdapters/queryAdapter.ts`
- `queryNativeTable()` — switch with 6 cases (mortgages, borrowers, lenders, brokers, deals, obligations)
- `queryNativeRecords()` — assembles UnifiedRecord[] from native docs + fieldDef mappings
