# Tasks: ENG-83 — Reconciliation queries (undisbursed, history, servicing fees)

Source: Linear ENG-83, WS6 Notion requirement and feature pages
Generated: 2026-03-19

## Phase 1: Query Auth & Read Models
- [x] T-001: Create the dispersal query auth surface in `convex/dispersal/queries.ts` using `authedQuery` plus `requirePermission("dispersal:view")`, and enforce `canAccessDispersal()` for lender-scoped reads while treating mortgage- and obligation-scoped reconciliation reads as FairLend-admin-only unless repo inspection during implementation reveals an existing broader contract.
- [x] T-002: Implement `getUndisbursedBalance` in `convex/dispersal/queries.ts` using the `dispersalEntries` `by_status` index to sum pending entries for one lender, returning `0` and `entryCount: 0` for empty result sets.
- [x] T-003: Implement `getDisbursementHistory` in `convex/dispersal/queries.ts` using the `dispersalEntries` `by_lender` index with optional `fromDate` / `toDate` filters, deterministic ordering, pagination support, and a total amount summary.
- [x] T-004: Implement `getDispersalsByMortgage` in `convex/dispersal/queries.ts` using the `dispersalEntries` `by_mortgage` index with optional date filtering, returning the matching entries, overall total, and per-lender breakdown.
- [x] T-005: Implement `getDispersalsByObligation` in `convex/dispersal/queries.ts` using the `dispersalEntries` `by_obligation` index, returning all dispersal rows for one obligation plus their summed total.
- [x] T-006: Implement `getServicingFeeHistory` in `convex/dispersal/queries.ts` using the `servicingFeeEntries` `by_mortgage` index with optional date filters, returning individual fee rows and `totalFees`.

## Phase 2: Tests & Verification
- [x] T-007: Add convex tests for lender-scoped reconciliation queries in `convex/dispersal/__tests__/reconciliation.test.ts`, covering pending-balance sums, empty states, date-range filtering, and lender-vs-other-lender authorization.
- [x] T-008: Extend `convex/dispersal/__tests__/reconciliation.test.ts` with mortgage-, obligation-, and servicing-fee query coverage, including admin access, per-lender aggregation, and empty-range behavior for admin-only reconciliation views.
- [ ] T-009: Run `bun check`, `bunx convex codegen`, `bun typecheck`, and the relevant dispersal/auth test suites; resolve any fallout needed to leave ENG-83 shippable. Blocked by missing `CONVEX_DEPLOYMENT` for codegen and unrelated pre-existing repo-wide `tsc` failures outside ENG-83 scope.
