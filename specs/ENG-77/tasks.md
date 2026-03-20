# Tasks: ENG-77 — Tests: Proration Scenarios (Deal Close Boundaries)

## Acceptance Criteria
- [x] **Exact proration:** $100K@10%, 100% transferred Jan 15 → seller 15/365=$410.96, buyer 16/365=$438.36, sum=31-day equivalent
- [x] **Partial transfer:** A=60%, B=40%, A sells 30% to C on Jan 20 → A two periods, B unchanged, C from Jan 21
- [x] **Closing first of month:** seller gets 1 day
- [x] **Closing last of month:** seller gets full month
- [x] **Key invariant:** seller_accrual + buyer_accrual = single_owner_accrual

## Implementation Steps

### T-001: Create proration.test.ts integration tests ✅
- **File:** `convex/accrual/__tests__/proration.test.ts`
- **Action:** Replace existing file with convex-test integration tests
- **Details:**
  - Import `convexTest` from `convex-test`
  - Import `getOwnershipPeriods` from `../ownershipPeriods`
  - Import `{ calculateAccrualForPeriods, calculatePeriodAccrual }` from `../interestMath`
  - Create seed helper: mortgage ($100K, 10%), lender accounts, journal entries
  - `describe("exact proration")`: full transfer on Jan 15, verify seller/buyer/sum
  - `describe("partial transfer")`: 3-lender scenario, verify all period chains
  - `describe("closing first of month")`: transfer on Jan 1, seller gets 1 day
  - `describe("closing last of month")`: transfer on Jan 31, seller gets full month
  - `describe("invariant")`: parameterized test across multiple dates, assert seller + buyer = single owner
- **Validation:** `bun run test convex/accrual/__tests__/proration.test.ts` passes (12 tests ✓)
- **Depends on:** ENG-69 ✓, ENG-70 ✓

### T-002: Verify all tests pass ✅
- **Action:** Run full accrual test suite
- **Validation:**
  - `proration.test.ts`: 12/12 passed ✓
  - `ownershipPeriods.test.ts`: 5/5 passed ✓
  - `accrual.integration.test.ts`: 1/1 passed ✓
  - `bun check`: No errors in proration.test.ts ✓ (pre-existing errors in `dispersal/` module)
  - `bun typecheck`: No errors in proration.test.ts ✓ (pre-existing errors in `dispersal/` module)
- **Note:** `interestMath.test.ts` has 6 pre-existing test failures unrelated to this issue
