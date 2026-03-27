# ENG-201 Chunk Manifest

| # | Chunk | Tasks | Status | Dependencies |
|---|-------|-------|--------|-------------|
| 1 | chunk-01-rbac-foundation | T-001 – T-003 | blocked (pending `bunx convex codegen` env) | None |
| 2 | chunk-02-transfer-mutations | T-004 – T-006 | blocked (pending `bunx convex codegen` env) | Chunk 1 |
| 3 | chunk-03-transfer-queries | T-007 – T-009 | blocked (pending `bunx convex codegen` env) | Chunk 1 |
| 4 | chunk-04-tests-quality | T-010 – T-011 | blocked (pending `bunx convex codegen` env) | Chunk 2 + Chunk 3 |

## Execution Order
1. `chunk-01-rbac-foundation`
2. `chunk-02-transfer-mutations`
3. `chunk-03-transfer-queries`
4. `chunk-04-tests-quality`

## Quality Gate (after each chunk)
```bash
bun check
bun typecheck
bunx convex codegen
```

A chunk can be marked `completed` only after all three commands pass in the active environment.
