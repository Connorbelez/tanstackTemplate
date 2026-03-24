# Chunk 03: Tests

- [ ] T-011: Create test file with test harness setup and helpers for posting entries
- [ ] T-012: Test: Clean replay passes — post 5 entries, replay returns `passed: true`
- [ ] T-013: Test: Drift detection — patch account cumulativeDebits to wrong value, replay detects mismatch
- [ ] T-014: Test: Missing sequence detection — entries with gap, replay reports missing sequences
- [ ] T-015: Test: Account scope — replay with `accountId` only checks that account
- [ ] T-016: Test: Mortgage scope — replay with `mortgageId` filters correctly
- [ ] T-017: Test: Empty ledger — no entries, replay returns `passed: true`, zero entries replayed
- [ ] T-018: Test: Idempotent replay — run twice, same result (read-only verification)
- [ ] T-019: Test: Credit-normal vs debit-normal families handled correctly
- [ ] T-020: Test: Cursor advancement — replay, advance cursor, post more entries, incremental only covers new entries
- [ ] T-021: Test: REVERSAL entries correctly reduce replayed totals
