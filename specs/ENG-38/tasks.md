# ENG-38 — Point-in-Time Queries: Master Task List

## Chunk 1: Query Fixes (queries.ts) ✅

- [x] T-001: Import `AUDIT_ONLY_ENTRY_TYPES` in queries.ts and add filtering to `getBalanceAt` replay loop
- [x] T-002: Add `AUDIT_ONLY_ENTRY_TYPES` filtering to `getPositionsAt` replay loop
- [x] T-003: Add explicit `entries.sort(compareSequenceNumbers)` in `getPositionsAt` for same-millisecond determinism
- [x] T-004: Also filter audit-only entries from `accountIds` collection in `getPositionsAt`

## Chunk 2: Test Expansion (ledger.test.ts) ✅

- [x] T-005: Add T-070d test — multi-step transfer sequence with intermediate point-in-time queries
- [x] T-006: Add T-070e test — determinism across multiple identical calls
- [x] T-007: Add T-070f test (skipped) — SHARES_RESERVED entries excluded from replay (requires ENG-34)
- [x] T-008: Add T-070g test — getBalanceAt tracks balance evolution across lifecycle

## Quality Gate ✅

- [x] T-009: `bun check` — passed, no fixes needed
- [x] T-010: `bun typecheck` — no new errors (pre-existing errors in unrelated files only)
