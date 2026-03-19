# Chunk 02: Accrual Query API — Status

Completed: 2026-03-19 17:31 America/Toronto

## Tasks Completed
- [x] T-005: Create `convex/accrual/calculateAccruedInterest.ts` as the single lender × mortgage query using `ledgerQuery`, mortgage contract data, ownership periods, and accrual math with no rounding.
- [x] T-006: Create `convex/accrual/calculateAccruedByMortgage.ts` to return per-lender breakdowns and mortgage-level totals for a date range using current position accounts plus reconstructed periods.
- [x] T-007: Create `convex/accrual/calculateInvestorPortfolio.ts` to aggregate accrual across every mortgage where a lender has a position, reusing the single-mortgage computation flow.
- [x] T-008: Create `convex/accrual/calculateDailyAccrual.ts` to return a one-day snapshot per lender for a mortgage using Actual/365 daily accrual semantics.
- [x] T-009: Wire auth and identifier handling in the query layer so accrual endpoints use `ledgerQuery`, apply `canAccessAccrual` where needed, and consistently bridge mortgage row IDs to ledger mortgage keys.

## Tasks Incomplete
- [ ] None.

## Quality Gate
- `bunx vitest run convex/accrual/__tests__/queryHelpers.test.ts convex/accrual/__tests__/ownershipPeriods.test.ts convex/accrual/__tests__/proration.test.ts`: pass
- `bun check`: pass
- `bun typecheck`: not rerun in this chunk; prior repo-wide run still fails on unrelated existing errors in `convex/deals/__tests__/*`, `convex/ledger/__tests__/ledger.test.ts`, `src/components/admin/deal-card.tsx`, `src/routes/demo/convex-ledger.tsx`, and `src/routes/demo/prod-ledger.tsx`
- `bunx convex codegen`: not rerun in this chunk; previously blocked because `CONVEX_DEPLOYMENT` is unset in this environment

## Notes
- Shared accrual helpers now centralize mortgage/lender/date-range math and identifier bridging, so the query files stay thin.
- `calculateAccruedInterest`, `calculateAccruedByMortgage`, `calculateInvestorPortfolioAccrual`, and `calculateDailyAccrual` now all reuse the same ownership reconstruction flow.
- The focused accrual helper tests pass against real Convex ledger rows and seeded mortgage docs.
