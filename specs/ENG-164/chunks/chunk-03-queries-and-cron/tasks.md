# Chunk 3: Public Queries and Cron

- [x] T-013: Create `reconciliationQueries.ts` — public query endpoints using `cashLedgerQuery` with optional filters (`mortgageId`, `lenderId`, `fromDate`, `toDate`)
- [x] T-014: Create `reconciliationCron.ts` — `internalQuery` for suite execution + `internalMutation` for audit logging + `internalAction` as cron entry point
- [x] T-015: Wire into `crons.ts` — add cash ledger reconciliation at 07:15 UTC
