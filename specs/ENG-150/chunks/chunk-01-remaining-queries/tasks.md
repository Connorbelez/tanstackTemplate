# Chunk 01: Remaining Queries & Middleware

## Tasks

### T-001: Add cashLedgerQuery middleware to fluent.ts
- [ ] Add `cashLedgerQuery = authedQuery.use(requirePermission("cash_ledger:view"))` after ledgerMutation
- [ ] Add `cashLedgerMutation = authedMutation.use(requirePermission("cash_ledger:correct"))` after cashLedgerQuery
- [ ] Export both

### T-002: Migrate existing queries from ledgerQuery to cashLedgerQuery
- [ ] In convex/payments/cashLedger/queries.ts, change import from `ledgerQuery` to `cashLedgerQuery`
- [ ] Replace all occurrences of `ledgerQuery` with `cashLedgerQuery` in the file
- [ ] Verify the file still compiles

### T-003: Add getAccountBalanceRange (date range query)
- [ ] Add to convex/payments/cashLedger/queries.ts
- [ ] Input: { accountId: v.id("cash_ledger_accounts"), fromDate: v.string(), toDate: v.string() }
- [ ] Fetch debit-side entries via by_debit_account_and_timestamp index
- [ ] Fetch credit-side entries via by_credit_account_and_timestamp index
- [ ] Merge, deduplicate by _id, sort by sequenceNumber
- [ ] Compute openingBalance from entries with effectiveDate < fromDate
- [ ] Collect entries with effectiveDate in [fromDate, toDate]
- [ ] Compute closingBalance = openingBalance + in-range deltas
- [ ] Apply family-aware sign convention
- [ ] Return { openingBalance, closingBalance, entries, entryCount }

### T-004: Add getBorrowerBalance query
- [ ] Add to convex/payments/cashLedger/queries.ts
- [ ] Input: { borrowerId: v.id("borrowers") }
- [ ] Query cash_ledger_accounts with by_borrower index
- [ ] Filter for family === "BORROWER_RECEIVABLE"
- [ ] Sum balances using getCashAccountBalance
- [ ] Return { total: bigint, obligations: Array<{ obligationId, balance }> }

### T-005: Add getBalancesByFamily aggregation query
- [ ] Add to convex/payments/cashLedger/queries.ts
- [ ] Input: { mortgageId: v.optional(v.id("mortgages")) }
- [ ] If mortgageId: use by_mortgage index to filter accounts
- [ ] If no mortgageId: use by_family index for each family
- [ ] Group by family, sum getCashAccountBalance
- [ ] Return Record<string, bigint> keyed by family name

### T-006: Add internal query variants for downstream consumers
- [ ] Add internalGetObligationBalance (returns number, not bigint)
- [ ] Add internalGetLenderPayableBalance (returns number, not bigint)
- [ ] Add internalGetMortgageCashState (returns Record<string, number>)
- [ ] All use internalQuery from ../../_generated/server

### T-007: Quality gate
- [ ] Run `bunx convex codegen`
- [ ] Run `bun check`
- [ ] Run `bun typecheck`
- [ ] Run `bun run test`
