# ENG-171 Chunk Manifest

| Chunk | Label | Tasks | Status |
|-------|-------|-------|--------|
| chunk-01 | Core Replay Module | T-001 → T-005 | pending |
| chunk-02 | Integration (Queries, Mutation, Cron) | T-006 → T-010 | pending |
| chunk-03 | Tests | T-011 → T-021 | pending |

## Execution Order
1. **chunk-01** — Core types and pure replay function (no external dependencies)
2. **chunk-02** — Wire replay into queries, reconciliation, and cron (depends on chunk-01)
3. **chunk-03** — Full test suite (depends on chunk-01 and chunk-02)
