# ENG-165 Chunk Manifest

## Execution Order

| # | Chunk | Tasks | Status |
|---|-------|-------|--------|
| 1 | chunk-01-schema-and-types | T-001 → T-005 | pending |
| 2 | chunk-02-check-functions | T-006 → T-010 | pending |
| 3 | chunk-03-self-healing-cron | T-011 → T-015 | pending |
| 4 | chunk-04-tests | T-016 → T-022 | pending |

## Dependencies
- Chunk 2 depends on Chunk 1 (types + schema must exist)
- Chunk 3 depends on Chunk 2 (check functions used by cron)
- Chunk 4 depends on Chunks 1-3 (tests exercise all code)

## Quality Gates
After each chunk: `bun check`, `bun typecheck`, `bunx convex codegen`
