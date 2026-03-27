# ENG-218 Chunk Manifest

| # | Chunk | Tasks | Status | Dependencies |
|---|-------|-------|--------|-------------|
| 1 | chunk-01-auth-entity-guard | T-001 – T-006 | partial | None |

Note: This table uses standard single-pipe Markdown table syntax; there is no leading empty column.

## Execution Order
```
Chunk 1 (auth/entity guard + docs + tests + quality gate)
```

## Quality Gate (after chunk)
```bash
bun check
bun typecheck
bunx convex codegen
```
