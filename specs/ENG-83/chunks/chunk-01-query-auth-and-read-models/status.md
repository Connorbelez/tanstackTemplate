# Chunk 01: Query Auth & Read Models — Status

Completed: 2026-03-19 17:00 EDT

## Tasks Completed
- [x] T-001: Added `convex/dispersal/queries.ts` with a `dispersal:view` query chain, lender-scoped `canAccessDispersal()` enforcement, and admin-only enforcement for mortgage- and obligation-scoped reconciliation reads.
- [x] T-002: Implemented `getUndisbursedBalance` via the `dispersalEntries` `by_status` index.
- [x] T-003: Implemented `getDisbursementHistory` via the `dispersalEntries` `by_lender` index with date filtering, deterministic ordering, running totals, and limit-based pagination semantics.
- [x] T-004: Implemented `getDispersalsByMortgage` via the `dispersalEntries` `by_mortgage` index with date filtering and per-lender aggregation.
- [x] T-005: Implemented `getDispersalsByObligation` via the `dispersalEntries` `by_obligation` index with total and per-lender aggregation.
- [x] T-006: Implemented `getServicingFeeHistory` via the `servicingFeeEntries` `by_mortgage` index with date filtering and total fee aggregation.

## Tasks Incomplete
- [ ] None.

## Quality Gate
- `bun check`: pass
- `bun run test -- convex/dispersal/__tests__/reconciliation.test.ts`: pass

## Notes
- The repo drift is real: the current branch uses `lenderId`, `by_lender`, `dispersal:view`, and `canAccessDispersal()`, not the older WS6 `investorId` / `by_investor` wording.
- The implementation followed the repo’s existing `queries.ts` convention instead of creating five one-function files under `convex/dispersal/queries/`.
