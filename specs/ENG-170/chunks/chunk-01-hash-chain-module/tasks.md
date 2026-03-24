# Chunk 1: Hash Chain Module + Pipeline Wiring

- [ ] T-001: Create `convex/payments/cashLedger/hashChain.ts` with `buildCashLedgerAuditArgs()` function
- [ ] T-002: Add `processCashLedgerHashChainStep` internalMutation that reads entry and calls `AuditTrail.insert()`
- [ ] T-003: Add `cashLedgerHashChainWorkflow` durable workflow wrapping the mutation step
- [ ] T-004: Add `startCashLedgerHashChain()` export with `DISABLE_CASH_LEDGER_HASHCHAIN` env var kill switch
- [ ] T-005: Wire `nudge()` in `postEntry.ts` to call `startCashLedgerHashChain()` — pass entry, balance-before, balance-after
- [ ] T-006: Modify `persistEntry()` to capture debit/credit balances BEFORE the update, return them alongside projected balances
- [ ] T-007: Add rejection auditing in `postCashEntryInternal()` — catch validation errors, insert audit record with `eventType: REJECTED`, re-throw
