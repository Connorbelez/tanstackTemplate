# ENG-205 Chunk Manifest

| Chunk | Label | Tasks | Status |
|-------|-------|-------|--------|
| 01 | Schema & Types | T-001, T-002, T-003 | done |
| 02 | Validation & Queries | T-004, T-005 | done |
| 03 | Integration & Seed | T-006, T-007, T-008 | done |
| 04 | Tests | T-009, T-010 | done |

## Execution Order
1 → 2 → 3 → 4 (strict sequential — each depends on previous)

## Quality Gate
After each chunk: `bunx convex codegen && bun typecheck && bun check`
After chunk 04: `bun run test convex/payments/bankAccounts/`
