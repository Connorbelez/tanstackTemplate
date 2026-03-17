# Chunk 01: Query Fixes

## Tasks

- [ ] T-001: Import `AUDIT_ONLY_ENTRY_TYPES` from `./constants` in `convex/ledger/queries.ts` and add filtering to `getBalanceAt` — skip entries where `entryType` is in `AUDIT_ONLY_ENTRY_TYPES` during the replay loop for both debits and credits
- [ ] T-002: Add the same `AUDIT_ONLY_ENTRY_TYPES` filtering to the `getPositionsAt` replay loop — skip audit-only entries when accumulating per-account balances
- [ ] T-003: In `getPositionsAt`, add `entries.sort(compareSequenceNumbers)` after collecting entries from the index, before the replay loop — this enforces same-millisecond determinism per spec compliance
- [ ] T-004: In `getPositionsAt`, also filter audit-only entries when collecting `accountIds` for batch-fetch — no need to fetch account info for accounts only referenced by skipped entries
