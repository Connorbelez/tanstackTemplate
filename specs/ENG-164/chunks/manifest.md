# ENG-164 Chunk Manifest

| Chunk | Tasks | Status | Description |
|-------|-------|--------|-------------|
| chunk-01-suite-types-and-checks | T-001 – T-009 | done | Define result types and implement all 8 reconciliation check functions |
| chunk-02-conservation-and-aggregation | T-010 – T-012 | done | Conservation of money checks + full suite aggregator |
| chunk-03-queries-and-cron | T-013 – T-015 | done | Public filterable query endpoints + cron action + wiring |
| chunk-04-tests | T-016 – T-019 | done | Tests for all checks, conservation, filtering, cron |

## Execution Order
1. chunk-01 → chunk-02 → chunk-03 → chunk-04
2. Each chunk depends on the previous (schema → logic → queries → tests)
