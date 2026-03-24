# ENG-164: Reconciliation Query Suite — Master Task List

## Chunk 1: Suite Types and Check Functions ✅
- [x] T-001: Define `ReconciliationCheckResult<T>` and all item type interfaces in `reconciliationSuite.ts`
- [x] T-002: Implement `checkUnappliedCash` — query UNAPPLIED_CASH accounts with balance > 0, compute aging in days
- [x] T-003: Implement `checkNegativePayables` — query LENDER_PAYABLE accounts where credits > debits (exclude active reversals)
- [x] T-004: Implement `checkObligationBalanceDrift` — for settled obligations, compare journal-derived vs `amountSettled`
- [x] T-005: Implement `checkControlNetZero` — reuse `findNonZeroPostingGroups` from `reconciliation.ts`, wrap in `ReconciliationCheckResult`
- [x] T-006: Implement `checkSuspenseItems` — query SUSPENSE accounts with balance > 0, add aging in days
- [x] T-007: Implement `checkOrphanedObligations` — query obligations past `due` without `OBLIGATION_ACCRUED` journal entry
- [x] T-008: Implement `checkStuckCollections` — query `collectionAttempts` in `executing` state > 7 days
- [x] T-009: Implement `checkOrphanedUnappliedCash` — UNAPPLIED_CASH with balance > 0 older than 7 days

## Chunk 2: Conservation Checks and Aggregation ✅
- [x] T-010: Implement `checkObligationConservation` — verify SUM(dispersals) + servicingFee == obligation.amount for all settled obligations
- [x] T-011: Implement `checkMortgageMonthConservation` — per mortgage/month, verify settled amounts == dispersals + fees
- [x] T-012: Implement `runFullReconciliationSuite` — run all 8 checks + 2 conservation checks, return aggregated `{ isHealthy, checkResults }`

## Chunk 3: Public Queries and Cron ✅
- [x] T-013: Create `reconciliationQueries.ts` — public query endpoints using `cashLedgerQuery` with optional filters (`mortgageId`, `lenderId`, `fromDate`, `toDate`)
- [x] T-014: Create `reconciliationCron.ts` — `internalQuery` for suite execution + `internalMutation` for audit logging + `internalAction` as cron entry point
- [x] T-015: Wire into `crons.ts` — add cash ledger reconciliation at 07:15 UTC

## Chunk 4: Tests ✅
- [x] T-016: Write tests for checks 1-4 (unapplied cash, negative payables, obligation drift, CONTROL net-zero)
- [x] T-017: Write tests for checks 5-8 (suspense items, orphaned obligations, stuck collections, orphaned unapplied)
- [x] T-018: Write tests for conservation checks and filtering
- [x] T-019: Write tests for `runFullReconciliationSuite` aggregation and cron action pattern
