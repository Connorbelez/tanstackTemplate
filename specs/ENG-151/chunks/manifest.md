# ENG-151 Chunk Manifest

| Chunk | Name | Tasks | Status |
|-------|------|-------|--------|
| 01 | shared-test-utils | T-001 to T-005 | pending |
| 02 | pipeline-unit-tests | T-006 to T-012 | pending |
| 03 | entry-type-coverage | T-013 to T-015 | pending |
| 04 | financial-invariants | T-016 to T-021 | pending |
| 05 | existing-mods-verification | T-022 to T-025 | pending |

## Execution Order
Sequential: chunk-01 → chunk-02 → chunk-03 → chunk-04 → chunk-05

## Dependencies
- chunk-02 depends on chunk-01 (shared utilities)
- chunk-03 depends on chunk-01 (shared utilities)
- chunk-04 depends on chunk-01 (shared utilities)
- chunk-05 depends on chunks 01-04 (modifies existing + runs full verification)
