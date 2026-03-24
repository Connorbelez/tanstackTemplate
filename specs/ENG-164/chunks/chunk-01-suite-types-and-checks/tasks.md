# Chunk 1: Suite Types and Check Functions

- [x] T-001: Define `ReconciliationCheckResult<T>` and all item type interfaces in `reconciliationSuite.ts`
- [x] T-002: Implement `checkUnappliedCash` — query UNAPPLIED_CASH accounts with balance > 0, compute aging in days
- [x] T-003: Implement `checkNegativePayables` — query LENDER_PAYABLE accounts where credits > debits (exclude active reversals)
- [x] T-004: Implement `checkObligationBalanceDrift` — for settled obligations, compare journal-derived vs `amountSettled`
- [x] T-005: Implement `checkControlNetZero` — reuse `findNonZeroPostingGroups` from `reconciliation.ts`, wrap in `ReconciliationCheckResult`
- [x] T-006: Implement `checkSuspenseItems` — query SUSPENSE accounts with balance > 0, add aging in days
- [x] T-007: Implement `checkOrphanedObligations` — query obligations past `due` without `OBLIGATION_ACCRUED` journal entry
- [x] T-008: Implement `checkStuckCollections` — query `collectionAttempts` in `executing` state > 7 days
- [x] T-009: Implement `checkOrphanedUnappliedCash` — UNAPPLIED_CASH with balance > 0 older than 7 days
