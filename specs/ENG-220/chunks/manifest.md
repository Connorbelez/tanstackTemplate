# ENG-220 Chunk Manifest

| # | Chunk | Tasks | Status | Dependencies |
|---|-------|-------|--------|-------------|
| 1 | chunk-01-provider-core | T-001 – T-004 | completed | Existing transfer provider interface/types |
| 2 | chunk-02-registry-integration | T-005 – T-007 | completed | Chunk 1 |
| 3 | chunk-03-tests-docs | T-008 – T-011 | completed | Chunks 1-2 |

## Execution Order
```
chunk-01-provider-core -> chunk-02-registry-integration -> chunk-03-tests-docs
```

## Quality Gate (after each chunk)
```bash
bunx convex codegen
bun check
bun typecheck
```
