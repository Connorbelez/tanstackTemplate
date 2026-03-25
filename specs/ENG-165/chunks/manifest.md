# ENG-165 Chunk Manifest

## Execution Order

| # | Chunk | Tasks | Status |
|---|-------|-------|--------|
| 1 | chunk-01-schema-and-types | TR-001 | pending |
| 2 | chunk-02-check-functions | TR-002 | pending |
| 3 | chunk-03-self-healing-cron | TR-003 | pending |
| 4 | chunk-04-tests | TR-004 | pending |

## Dependencies
- Chunk 2 depends on Chunk 1 (types + schema must exist)
- Chunk 3 depends on Chunk 2 (check functions used by cron)
- Chunk 4 depends on Chunks 1-3 (tests exercise all code)

## Quality Gates
After each chunk: `bun check`, `bun typecheck`, `bunx convex codegen`
