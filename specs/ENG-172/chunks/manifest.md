# ENG-172 Chunk Manifest

| Chunk | Label | Tasks | Dependencies | Status |
|-------|-------|-------|-------------|--------|
| 01 | core-reversal-cascade | T-001 → T-003 | None (builds on existing postEntry pipeline) | pending |
| 02 | reconciliation-detection | T-004 → T-005 | None (parallel-safe with chunk 01) | pending |
| 03 | unit-tests-cascade | T-006 → T-013 | chunk-01 | pending |
| 04 | unit-tests-reconciliation | T-014 → T-016 | chunk-02 | pending |
| 05 | integration-test | T-017 → T-020 | chunk-01, chunk-02 | pending |
| 06 | quality-gate | T-021 → T-024 | chunk-01 through chunk-05 | pending |

## Execution Order
1. chunk-01 + chunk-02 (can dispatch in parallel)
2. chunk-03 + chunk-04 (can dispatch in parallel after their deps)
3. chunk-05 (after chunks 01-04)
4. chunk-06 (final gate)
