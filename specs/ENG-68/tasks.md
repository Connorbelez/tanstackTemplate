# Tasks: ENG-68 — [WS6] Dispersal Accounting

Source: Linear `ENG-68`, Notion implementation plan v2
Generated: 2026-03-19

## Phase 1: Core Helpers & Entry Creation
- [x] T-001: Verify and normalize dispersal money and unit conventions against the current repo: payment amounts and `mortgages.principal` are integer cents, while ledger positions and `dealReroutes.fractionalShare` are ownership units out of `10_000`; preserve actual schema names (`lenderId`, `lenderAccountId`, `principal`, `ledger_accounts`).
- [x] T-002: Extend `convex/accrual/types.ts` and `convex/accrual/interestMath.ts` with a reusable `PositionShare` type and `calculateProRataShares(...)` largest-remainder helper keyed by `lenderId` and `ledger_accounts` IDs.
- [x] T-003: Fix and normalize `convex/dispersal/servicingFee.ts` and `convex/dispersal/__tests__/servicingFee.test.ts` so servicing fee math uses cents and matches `mortgages.principal` plus `annualServicingRate`.
- [x] T-004: Create `convex/dispersal/createDispersalEntries.ts` as the internal mutation that performs idempotency, loads mortgage and active positions, applies effective `dealReroutes`, calculates servicing fee and pro-rata shares, inserts `dispersalEntries` and `servicingFeeEntries`, and returns created or existing results.
- [x] T-005: Replace the current GT dispersal stub wiring so `OBLIGATION_SETTLED` schedules the real dispersal mutation with `{ obligationId, mortgageId, settledAmount, settledDate, idempotencyKey, source }` while preserving the existing effect path.

## Phase 2: Reconciliation Queries
- [x] T-006: Create `convex/dispersal/queries/getUndisbursedBalance.ts` and `convex/dispersal/queries/getDisbursementHistory.ts` with auth and index usage aligned to `by_status` and `by_lender`.
- [x] T-007: Create `convex/dispersal/queries/getDispersalsByMortgage.ts` and `convex/dispersal/queries/getDispersalsByObligation.ts` with lender breakdowns and calculation details.
- [x] T-008: Create `convex/dispersal/queries/getServicingFeeHistory.ts` using `servicingFeeEntries.by_mortgage` and date filtering.

## Phase 3: Tests & Verification
- [x] T-009: Add `convex/dispersal/__tests__/calculateProRataShares.test.ts` covering exact-sum, equal-split odd-cent, and largest-remainder edge cases.
- [x] T-010: Add `convex/dispersal/__tests__/createDispersalEntries.test.ts` covering happy path, reroute application, idempotency, no-position, and fee-exceeds-settlement failures.
- [x] T-011: Add `convex/dispersal/__tests__/reconciliation.test.ts` covering undisbursed balance, history filtering, per-mortgage and per-obligation views, and servicing fee history.
- [ ] T-012: Run `bun check`, `bun typecheck`, and `bunx convex codegen`, then resolve any integration drift introduced by the new modules.
- [ ] T-013: Run `coderabbit review --plain` after the full spec implementation and address any high-signal issues if the tool is available in this environment.
