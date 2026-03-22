# ENG-150: Current-State & Point-in-Time Balance Queries — Master Task List

## Status Legend
- `[ ]` — Not started
- `[x]` — Complete
- `[~]` — Partial / blocked

## Pre-existing (completed by ENG-148)
- [x] Schema tables + all indexes (including by_debit_account_and_timestamp, by_credit_account_and_timestamp)
- [x] Types, constants, family maps (convex/payments/cashLedger/types.ts)
- [x] Balance computation helpers (convex/payments/cashLedger/accounts.ts)
- [x] getAccountBalance — current balance from cumulative totals
- [x] getObligationBalance — outstanding receivable with reconciliation
- [x] getMortgageCashState — aggregated cash-side state by family
- [x] getLenderPayableBalance — outstanding payable for a lender
- [x] getUnappliedCash — all UNAPPLIED_CASH balances > 0
- [x] getSuspenseItems — all SUSPENSE entries with metadata
- [x] getAccountBalanceAt — balance at historical point (using by_debit/credit_account_and_timestamp indexes)
- [x] getObligationHistory — full posting history for obligation
- [x] CONTROL subaccount queries (getControlAccounts, getControlBalance, controlNetZeroCheck)
- [x] Reconciliation helpers (getJournalSettledAmount, reconcileObligationSettlementProjection)

## Chunk 01: Remaining Queries & Middleware

### T-001: Add cashLedgerQuery middleware to fluent.ts
- [x] Add `cashLedgerQuery = authedQuery.use(requirePermission("cashLedger:view"))` to convex/fluent.ts
- [x] Add `cashLedgerMutation = authedMutation.use(requirePermission("cashLedger:correct"))` to convex/fluent.ts

### T-002: Migrate existing queries from ledgerQuery to cashLedgerQuery
- [x] In convex/payments/cashLedger/queries.ts, changed import to `cashLedgerQuery`
- [x] All 13 public queries now use `cashLedgerQuery` middleware

### T-003: Add getAccountBalanceRange (date range query)
- [x] Input: accountId, fromDate, toDate (YYYY-MM-DD strings)
- [x] Fetches both debit and credit entries, deduplicates, sorts by sequenceNumber
- [x] Computes opening/closing balances with family-aware sign convention
- [x] Returns { openingBalance, closingBalance, entries, entryCount }

### T-004: Add getBorrowerBalance query
- [x] Input: borrowerId
- [x] Filters BORROWER_RECEIVABLE accounts by borrower
- [x] Returns { total, obligations: [{ obligationId, balance }] }

### T-005: Add getBalancesByFamily aggregation query
- [x] Input: optional mortgageId
- [x] Groups all accounts by family, sums balances
- [x] Returns Record<string, bigint>

### T-006: Add internal query variants for downstream consumers
- [x] internalGetObligationBalance — returns number
- [x] internalGetLenderPayableBalance — returns number
- [x] internalGetMortgageCashState — returns Record<string, number>

### T-007: Quality gate
- [x] `bun check` — 0 new errors (5 pre-existing in dispersal module)
- [x] `bun typecheck` — 0 new errors (1 pre-existing vite/client type def)
- [x] `bun run test` (cash ledger) — 4/4 integration tests pass, 31/32 unit tests pass (1 pre-existing failure in getOrCreateCashAccount)
