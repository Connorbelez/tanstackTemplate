# Chunk 01: Core Replay Module

- [ ] T-001: Create `replayIntegrity.ts` with exported types (`ReplayScope`, `ReplayMismatch`, `ReplayResult`)
- [ ] T-002: Implement `replayJournalIntegrity()` — load entries by sequence, accumulate per-account debits/credits, compare against stored balances
- [ ] T-003: Implement scope filtering (`filterByScope`) for account, mortgage, and full-system scopes
- [ ] T-004: Implement missing sequence gap detection (full mode only)
- [ ] T-005: Implement cursor read helper (`getReplayCursor`) to load last processed sequence from `cash_ledger_cursors`
