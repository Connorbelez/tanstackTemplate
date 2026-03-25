# ENG-177 Chunk Manifest

| Chunk | Tasks | Status | Description |
|-------|-------|--------|-------------|
| chunk-01-helpers | T-001 → T-006 | pending | Conservation assertion helpers + createDueObligation |
| chunk-02-scenarios-1-3 | T-007 → T-010 | pending | E2E test file + scenarios 1-3 (happy path, partial, multi-lender) |
| chunk-03-scenarios-4-8 | T-011 → T-015 | pending | Scenarios 4-8 (reversal.skip, correction, waiver, write-off) |
| chunk-04-conservation | T-016 → T-021 | pending | Financial conservation invariant test suite + quality gate |

## Execution Order
1. chunk-01 (helpers must exist before scenarios)
2. chunk-02 (core scenarios first)
3. chunk-03 (remaining scenarios)
4. chunk-04 (conservation suite + final quality gate)
