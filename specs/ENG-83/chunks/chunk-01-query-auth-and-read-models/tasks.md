# Chunk 01: Query Auth & Read Models

- [ ] T-001: Create the dispersal query auth surface in `convex/dispersal/queries.ts` using `authedQuery` plus `requirePermission("dispersal:view")`, and enforce `canAccessDispersal()` for lender-scoped reads while treating mortgage- and obligation-scoped reconciliation reads as FairLend-admin-only unless repo inspection during implementation reveals an existing broader contract.
- [ ] T-002: Implement `getUndisbursedBalance` in `convex/dispersal/queries.ts` using the `dispersalEntries` `by_status` index to sum pending entries for one lender, returning `0` and `entryCount: 0` for empty result sets.
- [ ] T-003: Implement `getDisbursementHistory` in `convex/dispersal/queries.ts` using the `dispersalEntries` `by_lender` index with optional `fromDate` / `toDate` filters, deterministic ordering, pagination support, and a total amount summary.
- [ ] T-004: Implement `getDispersalsByMortgage` in `convex/dispersal/queries.ts` using the `dispersalEntries` `by_mortgage` index with optional date filtering, returning the matching entries, overall total, and per-lender breakdown.
- [ ] T-005: Implement `getDispersalsByObligation` in `convex/dispersal/queries.ts` using the `dispersalEntries` `by_obligation` index, returning all dispersal rows for one obligation plus their summed total.
- [ ] T-006: Implement `getServicingFeeHistory` in `convex/dispersal/queries.ts` using the `servicingFeeEntries` `by_mortgage` index with optional date filters, returning individual fee rows and `totalFees`.
