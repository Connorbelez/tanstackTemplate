# ENG-149 Chunk Manifest

| Chunk | Label | Tasks | Status |
|-------|-------|-------|--------|
| 01 | Types & Schema | T-001, T-002, T-003 | pending |
| 02 | Queries & Reconciliation | T-004, T-005, T-006, T-007 | pending |
| 03 | Tests | T-008 through T-014 | pending |

## Execution Order
Chunks execute sequentially: 01 → 02 → 03

## Quality Gate
After each chunk: `bun check && bun typecheck && bunx convex codegen`
