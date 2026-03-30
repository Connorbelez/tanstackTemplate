# ENG-255: Chunk Manifest

| Chunk | Tasks | Status |
|-------|-------|--------|
| chunk-01-adapter-infrastructure | T-001, T-002, T-003 | pending |
| chunk-02-integration | T-004, T-005 | pending |

## Execution Order
1. **chunk-01**: Merge main, create columnResolver.ts, create queryAdapter.ts
2. **chunk-02**: Wire into recordQueries.ts, run quality gates

## Dependencies
- chunk-02 depends on chunk-01 (needs adapter functions to exist)
