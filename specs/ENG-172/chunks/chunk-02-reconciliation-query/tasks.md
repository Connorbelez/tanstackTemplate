# Chunk 2: Reconciliation Query

## Tasks

- [ ] T-005: Add `findSettledObligationsWithNonZeroBalance()` to `reconciliation.ts`
  - Export `ReversalIndicator` interface
  - Query all settled obligations
  - For each, call `getJournalSettledAmountForObligation()` (already handles REVERSAL subtraction)
  - Return those where `BigInt(obligation.amount) - journalSettledAmount !== 0n`
  - Follow existing patterns from `reconcileObligationSettlementProjectionInternal()`

- [ ] T-006: Add `internalQuery` wrapper for use from reconciliation actions
  - Follow existing pattern for internal queries in the cash ledger module

- [ ] T-007: Add public query endpoint `getSettledObligationsWithNonZeroBalance` to `queries.ts`
  - Use `cashLedgerQuery` builder pattern
  - Returns serializable format (bigint → string conversion if needed)
