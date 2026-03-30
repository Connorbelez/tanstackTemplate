# Chunk 02: Integration & Quality

## T-004: Wire system adapter into recordQueries.ts
- File: `convex/crm/recordQueries.ts`
- Replace 3 ENG-255 stubs with actual native adapter calls
- Import queryNativeRecords from ./systemAdapters/queryAdapter

## T-005: Run quality gates
- `bun check` (auto-format + lint)
- `bun typecheck`
- `bunx convex codegen`
- All must pass with zero errors
