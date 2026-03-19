# Chunk 02: Accrual Query API

- [x] T-005: Create `convex/accrual/calculateAccruedInterest.ts` as the single lender × mortgage query using `ledgerQuery`, mortgage contract data, ownership periods, and accrual math with no rounding.
- [x] T-006: Create `convex/accrual/calculateAccruedByMortgage.ts` to return per-lender breakdowns and mortgage-level totals for a date range using current position accounts plus reconstructed periods.
- [x] T-007: Create `convex/accrual/calculateInvestorPortfolio.ts` to aggregate accrual across every mortgage where a lender has a position, reusing the single-mortgage computation flow.
- [x] T-008: Create `convex/accrual/calculateDailyAccrual.ts` to return a one-day snapshot per lender for a mortgage using Actual/365 daily accrual semantics.
- [x] T-009: Wire auth and identifier handling in the query layer so accrual endpoints use `ledgerQuery`, apply `canAccessAccrual` where needed, and consistently bridge mortgage row IDs to ledger mortgage keys.
