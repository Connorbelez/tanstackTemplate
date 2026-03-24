# ENG-170: Hash-Chained Audit Trail Integration — Master Task List

## Chunk 1: Hash Chain Module + Pipeline Wiring ✅
- [x] T-001: Create `convex/payments/cashLedger/hashChain.ts` with `buildCashLedgerAuditArgs()` function
- [x] T-002: Add `processCashLedgerHashChainStep` internalMutation that reads entry and calls `AuditTrail.insert()`
- [x] T-003: Add `cashLedgerHashChainWorkflow` durable workflow wrapping the mutation step
- [x] T-004: Add `startCashLedgerHashChain()` export with `DISABLE_CASH_LEDGER_HASHCHAIN` env var kill switch
- [x] T-005: Wire `nudge()` in `postEntry.ts` to call `startCashLedgerHashChain()` — pass entry, balance-before, balance-after
- [x] T-006: Modify `persistEntry()` to capture debit/credit balances BEFORE the update, return them alongside projected balances
- [x] T-007: Add rejection auditing in `postCashEntryInternal()` — catch validation errors, insert audit record with `eventType: REJECTED`, re-throw

## Chunk 2: Tests
- [ ] T-008: Create `convex/payments/cashLedger/__tests__/auditTrail.test.ts` with test harness setup
- [ ] T-009: Test: successful posting creates audit record with `entityType: 'cashLedgerEntry'`
- [ ] T-010: Test: balance state transitions recorded in `beforeState`/`afterState`
- [ ] T-011: Test: hash chain integrity — post multiple entries, verify chain via `AuditTrail.verifyChain()`
- [ ] T-012: Test: rejected posting creates audit record with `eventType` containing `:REJECTED`
- [ ] T-013: Test: correction chain auditable — post entry + correction, verify both have audit records with `causedBy` in metadata
- [ ] T-014: Test: idempotent posting does not duplicate audit (same idempotency key → single audit record)
