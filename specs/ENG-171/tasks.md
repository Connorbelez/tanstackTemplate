# ENG-171: Journal Replay Integrity Check — Master Task List

## Chunk 1: Core Replay Module ✅
- [x] T-001: Create `replayIntegrity.ts` with exported types (`ReplayScope`, `ReplayMismatch`, `ReplayResult`)
- [x] T-002: Implement `replayJournalIntegrity()` — load entries by sequence, accumulate per-account debits/credits, compare against stored balances
- [x] T-003: Implement scope filtering (`filterByScope`) for account, mortgage, and full-system scopes
- [x] T-004: Implement missing sequence gap detection (full mode only)
- [x] T-005: Implement cursor read helper (`getReplayCursor`) to load last processed sequence from `cash_ledger_cursors`

## Chunk 2: Integration (Queries, Mutation, Cron) ✅
- [x] T-006: Add `advanceReplayCursor` internal mutation in `replayIntegrity.ts`
- [x] T-007: Add `journalReplayIntegrityCheck` public query in `queries.ts` using `cashLedgerQuery`
- [x] T-008: Add `runReplayIntegrityCheck` internal query in `reconciliation.ts`
- [x] T-009: Add replay check to daily reconciliation action in `reconciliationAction.ts`
- [x] T-010: Run `bun check`, `bun typecheck`, `bunx convex codegen` — fix any issues

## Chunk 3: Tests ✅
- [x] T-011: Create test file with test harness setup and helpers for posting entries
- [x] T-012: Test: Clean replay passes — post 5 entries, replay returns `passed: true`
- [x] T-013: Test: Drift detection — patch account cumulativeDebits to wrong value, replay detects mismatch
- [x] T-014: Test: Missing sequence detection — entries with gap, replay reports missing sequences
- [x] T-015: Test: Account scope — replay with `accountId` only checks that account
- [x] T-016: Test: Mortgage scope — replay with `mortgageId` filters correctly
- [x] T-017: Test: Empty ledger — no entries, replay returns `passed: true`, zero entries replayed
- [x] T-018: Test: Idempotent replay — run twice, same result (read-only verification)
- [x] T-019: Test: Credit-normal vs debit-normal families handled correctly
- [x] T-020: Test: Cursor advancement — replay, advance cursor, post more entries, incremental only covers new entries
- [x] T-021: Test: REVERSAL entries correctly reduce replayed totals
