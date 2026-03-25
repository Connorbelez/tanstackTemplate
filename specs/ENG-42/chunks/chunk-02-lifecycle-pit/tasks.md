# Chunk 2: Lifecycle + Point-in-Time Tests

## Tasks

### T-005: Create lifecycle.test.ts — full lifecycle (AC #1, #2, #10, #12)
**File:** `convex/ledger/__tests__/lifecycle.test.ts`

Test scenarios:

1. **Complete lifecycle: mintAndIssue → reserve → commit → redeem → burn**
   - Use api.ledger.mutations.mintAndIssue to mint M1 with allocations: [A: 5000, B: 5000]
   - validateSupplyInvariant → valid, total=10000
   - reserveShares(2000 A→C) via executeReserveShares
   - Verify A.available = 3000 (5000 posted - 2000 pending)
   - validateSupplyInvariant → valid (pending doesn't affect invariant)
   - commitReservation via executeCommitReservation
   - validateSupplyInvariant → valid, A=3000, B=5000, C=2000
   - redeemShares(A: 3000 full exit → 0)
   - redeemShares(B: 5000 full exit → 0)
   - redeemShares(C: 2000 full exit → 0)
   - validateSupplyInvariant → valid, treasury=10000
   - burnMortgage
   - validateSupplyInvariant → valid (burned state)

2. **mintAndIssue atomicity: allocations != 10000 rejected with zero side effects**
   - Attempt mintAndIssue(6000 + 5000 = 11000) → rejected ALLOCATIONS_SUM_MISMATCH
   - Verify no TREASURY created, no POSITION accounts
   - This is already tested in mintAndIssue.test.ts but include here for completeness

3. **Sell-all exception vs min-fraction enforcement**
   - mintAndIssue M2 with A: 5000, B: 5000
   - transferShares(A→C, 5000) → accepted (sell-all, A goes to 0)
   - Verify A.posted = 0, C.posted = 5000
   - mintAndIssue M3 with D: 5000, E: 5000
   - redeemShares(D, 4500 → leaving 500) → rejected MIN_FRACTION_VIOLATED
   - redeemShares(D, 5000 → leaving 0) → accepted (sell-all)

4. **Multi-mortgage isolation: operations on M1 don't affect M2**
   - mintAndIssue M1 (A: 10000)
   - mintAndIssue M2 (A: 5000, B: 5000)
   - transferShares M1 (A→C, 5000)
   - redeemShares M1 (A→treasury, 5000), redeemShares M1 (C→treasury, 5000)
   - burnMortgage M1
   - validateSupplyInvariant M1 → valid (burned)
   - validateSupplyInvariant M2 → valid, total=10000 (unaffected)

### T-006: Add multi-mortgage lifecycle with reservations scenario
Same test file. Tests reserve + commit across two mortgages with the same buyer.

### T-007: Create pointInTime.test.ts — determinism tests (AC #4)
**File:** `convex/ledger/__tests__/pointInTime.test.ts`

Test scenarios:

1. **getPositionsAt same timestamp returns identical results across runs**
   - mintAndIssue at t0 (record timestamp from journal entry)
   - transferShares at t1
   - transferShares at t2
   - getPositionsAt(mortgageId, t1) → snapshot S1
   - Add more entries at t3
   - getPositionsAt(mortgageId, t1) → snapshot S2
   - Assert S1 deep-equals S2

2. **getBalanceAt returns correct balance at each timestamp**
   - mintAndIssue(10000 to A) at t0
   - issueShares at t1 (not used here - actually A already has all 10000 from mintAndIssue)
   - Actually: mint+issue A:5000, B:5000 at t0
   - transferShares(A→C, 2000) at t1
   - getBalanceAt(A.accountId, t0) → 5000
   - getBalanceAt(A.accountId, t1) → 3000
   - getBalanceAt(C.accountId, t0) → 0
   - getBalanceAt(C.accountId, t1) → 2000

3. **Audit-only entries (SHARES_RESERVED, SHARES_VOIDED) don't affect point-in-time balance**
   - mintAndIssue A:5000, B:5000
   - reserveShares(A→C, 2000) at t1
   - getBalanceAt(A.accountId, after_t1) → still 5000 (SHARES_RESERVED is audit-only)
   - voidReservation at t2
   - getBalanceAt(A.accountId, after_t2) → still 5000

4. **SHARES_COMMITTED DOES affect point-in-time balance**
   - reserveShares(A→C, 2000) then commitReservation at t3
   - getBalanceAt(A.accountId, after_t3) → 3000

### T-008: Quality gate
Run `bun check`, `bun typecheck`, `bunx convex codegen`.
