# ENG-197 Chunk Manifest

| # | Chunk | Tasks | Status | Dependencies |
|---|-------|-------|--------|-------------|
| 1 | chunk-01-bridge-mapping | T-001 – T-003 | completed | ENG-188, ENG-190, ENG-192, ENG-195, ENG-199 already merged |
| 2 | chunk-02-tests-verification | T-004 – T-006 | completed | Chunk 1 |

## Execution Order
```text
chunk-01-bridge-mapping -> chunk-02-tests-verification
```

## Quality Gate (after each chunk)
```bash
bunx convex codegen
bun check
bun typecheck
```
