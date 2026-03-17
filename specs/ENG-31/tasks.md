# ENG-31 — burnMortgage Convenience Mutation Tasks

## Status: Complete

### Chunk 01: Fix validateSupplyInvariant + Add Missing Tests

- [x] T-001: Fix `validateSupplyInvariant` in `convex/ledger/queries.ts` — added `isBurned` condition
- [x] T-002: Fix `validateSupplyInvariant` in `convex/ledger/validation.ts` — added `isBurned` condition
- [x] T-003: Add test T-076 — double-burn idempotency (same idempotencyKey returns same entry)
- [x] T-004: Add test T-077 — validateSupplyInvariant returns `valid: true, total: 0` after burn (both implementations)
- [x] T-005: Quality gate passed — `bun check`, `bun typecheck`, all 983 tests pass
