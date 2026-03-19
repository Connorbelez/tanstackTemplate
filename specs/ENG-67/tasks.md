# ENG-67 — Interest Accrual Computation Engine

## Master Task List

### Chunk 1: Ownership Period Reconstruction
- [x] T-001: Align `convex/accrual/types.ts` with the ledger’s actual identifier conventions so accrual code uses `lenderId` consistently and can bridge mortgage `Id<"mortgages">` values to ledger string keys without unsafe casts leaking through the API.
- [x] T-002: Create `convex/accrual/ownershipPeriods.ts` with `getOwnershipPeriods()` that finds the lender POSITION account, merges debit and credit journal history, skips audit-only entries, sorts deterministically by `sequenceNumber`, and emits inclusive ownership periods with closing date accruing to the seller.
- [x] T-003: Create `convex/accrual/__tests__/ownershipPeriods.test.ts` covering mint/issue, mid-period transfer, full exit, audit-only entries, and deterministic period reconstruction from real ledger rows.
- [x] T-004: Create `convex/accrual/__tests__/proration.test.ts` covering the seller-closing-date rule and verifying split-owner accrual sums match the equivalent single-owner accrual for the same date range.

### Chunk 2: Accrual Query API
- [x] T-005: Create `convex/accrual/calculateAccruedInterest.ts` as the single lender × mortgage query using `ledgerQuery`, mortgage contract data, ownership periods, and accrual math with no rounding.
- [x] T-006: Create `convex/accrual/calculateAccruedByMortgage.ts` to return per-lender breakdowns and mortgage-level totals for a date range using current position accounts plus reconstructed periods.
- [x] T-007: Create `convex/accrual/calculateInvestorPortfolio.ts` to aggregate accrual across every mortgage where a lender has a position, reusing the single-mortgage computation flow.
- [x] T-008: Create `convex/accrual/calculateDailyAccrual.ts` to return a one-day snapshot per lender for a mortgage using Actual/365 daily accrual semantics.
- [x] T-009: Wire auth and identifier handling in the query layer so accrual endpoints use `ledgerQuery`, apply `canAccessAccrual` where needed, and consistently bridge mortgage row IDs to ledger mortgage keys.

### Chunk 3: Integration Verification
- [x] T-010: Create `convex/accrual/__tests__/accrual.integration.test.ts` with convex-test coverage for real mortgage rows plus seeded ledger activity, validating single-lender, per-mortgage, portfolio, and daily snapshot queries.
- [x] T-011: Run focused accrual test suites and fix any implementation drift revealed by integration or auth failures.
- [x] T-012: Run the repo quality gate in the required order: `bun check`, `bun typecheck`, `bunx convex codegen`.
- [ ] T-013: Run `coderabbit review --plain` after the full ENG-67 implementation pass and address any material findings before closing the work.
