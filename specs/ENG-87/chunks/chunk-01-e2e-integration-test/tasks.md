# ENG-87 Chunk Tasks — E2E Integration Test

## T-001: Create test file with harness, identity helpers, and seedMortgage

Create `convex/dispersal/__tests__/integration.test.ts` with:

1. All required imports:
   - `makeFunctionReference` from `convex/server`
   - `convexTest` from `convex-test`
   - `describe, expect, it` from `vitest`
   - `api, internal` from `../../_generated/api`
   - `Id` from `../../_generated/dataModel`
   - `FAIRLEND_STAFF_ORG_ID` from `../../constants`
   - `schema` from `../../schema`
   - `createDispersalEntries` from `../createDispersalEntries`
   - `calculatePeriodAccrual` from `../accrual/interestMath`

2. Type definitions:
   - `AccruedInterestQueryArgs` and `AccruedInterestQueryResult` (matching the query return)
   - `CreateDispersalEntriesResult` (matching the mutation return)
   - `TestHarness` type alias

3. `SINGLE_LENDER_QUERY` using `makeFunctionReference` pointing to `accrual/calculateAccruedInterest:calculateAccruedInterest`

4. `ADMIN_IDENTITY` object with `FAIRLEND_STAFF_ORG_ID`

5. `lenderIdentity(subject: string)` helper

6. `createHarness()` factory

7. `asAdmin(t)` and `asLender(t, lenderId)` helpers

8. `initCounter(t)` helper to call `api.ledger.sequenceCounter.initializeSequenceCounter`

9. `seedMortgageDoc(t, overrides?)` that inserts: users (broker + borrower), broker, property, and mortgage with `principal: 10_000_000`, `interestRate: 0.10`, `annualServicingRate: 0.01`. Returns just `mortgageId: Id<"mortgages">`.

10. `mintAndIssue(t, mortgageId, lenderId, amount, effectiveDate)` helper using `api.ledger.mutations.mintMortgage` and `internal.ledger.mutations.issueShares`

11. `seedTestObligation(t, mortgageId, borrowerId, amount, settledDate)` that inserts an obligation with `status: "settled"`

12. `runCreateDispersal(t, args)` that calls `createDispersalEntries._handler` directly (bypassing GT scheduler)

## T-002: Write Test 1 — fullChain

Test scenario: $100K @ 10% mortgage, A(60%) B(40%), 30-day period, settle $833.33

### Steps:
1. Create harness, init counter
2. Seed mortgage (principal=10_000_000, interestRate=0.10, annualServicingRate=0.01, termStartDate="2026-01-01")
3. Mint + Issue A: 6000 units, B: 4000 units (effectiveDate="2026-01-01")
4. Query accrual for A: fromDate="2026-01-01", toDate="2026-01-31"
   - Expected: ~$493.15 (49_315 cents)
   - Use `calculatePeriodAccrual(0.10, 1, 100_000, 31)` to verify
5. Query accrual for B: fromDate="2026-01-01", toDate="2026-01-31"
   - Expected: ~$328.77 (32_877 cents)
6. Seed obligation with `amount: 83_333`, `settledDate: "2026-01-31"`
7. Call `runCreateDispersal` with `settledAmount: 83_333`
8. Assert `result.created === true`
9. Assert 2 dispersal entries, sum = 75_000 (after $83.33 servicing fee)
10. Persist-check: verify each entry's persisted amount in DB
11. Verify `getDispersalsByObligation` returns both entries with correct amounts
12. Verify `getUndisbursedBalance` for A = 45_000 cents, B = 30_000 cents

### Expected values:
- Servicing fee: 83_333 - (0.01 × 10_000_000 / 12) = 83_333 - 8_333 = 75_000 distributable
- A's share: 75_000 × 0.60 = 45_000 cents
- B's share: 75_000 × 0.40 = 30_000 cents

## T-003: Write Test 2 — dealCloseProration

Test scenario: A(100%) → day 15 deal close → A(50%) B(50%), verify proration and 50/50 dispersal

### Steps:
1. Create harness, init counter
2. Seed mortgage with termStartDate="2026-01-01"
3. Mint + Issue A: 10_000 units (100%) on "2026-01-01"
4. Transfer 5_000 units from A to B on "2026-01-15" (using `api.ledger.mutations.transferShares`)
5. Query A's accrual for "2026-01-01" to "2026-01-31"
   - Expected: 15 days @ 100% + 16 days @ 50%
   - Periods should be: [{fraction: 1, fromDate: "2026-01-01", toDate: "2026-01-15"}, {fraction: 0.5, fromDate: "2026-01-16", toDate: "2026-01-31"}]
   - Verify accruedInterest matches `calculatePeriodAccrual(0.10, 1, 100_000, 15) + calculatePeriodAccrual(0.10, 0.5, 100_000, 16)`
6. Query B's accrual for "2026-01-01" to "2026-01-31"
   - Expected: 16 days @ 50%
   - Periods should be: [{fraction: 0.5, fromDate: "2026-01-16", toDate: "2026-01-31"}]
7. Seed obligation with `amount: 83_333`, `settledDate: "2026-01-31"`
8. Call `runCreateDispersal`
9. Assert dispersal entries split 50/50 (current positions after transfer)
   - A gets 50% of 75_000 = 37_500 cents
   - B gets 50% of 75_000 = 37_500 cents

## T-004: Write Test 3 — multipleSettlements

Test scenario: A(60%) B(40%), 3 sequential obligations, verify accumulation

### Steps:
1. Create harness, init counter
2. Seed mortgage A(60%) B(40%)
3. For i = 1 to 3:
   a. Seed obligation i with `amount: 50_000`, `settledDate: "2026-01-31"` (same date OK since idempotency key differs)
   b. Call `runCreateDispersal` with `settledAmount: 50_000`, idempotencyKey=`test:obligation-${i}`
   c. Assert `result.created === true`
   d. Assert 2 entries with correct split: A=30_000, B=20_000
4. After all 3:
   - Verify `getUndisbursedBalance(A)` = 90_000 cents (3 × 30_000)
   - Verify `getUndisbursedBalance(B)` = 60_000 cents (3 × 20_000)
5. Verify `getDispersalsByObligation` for each obligation returns correct 2 entries

## T-005: Quality gate

Run in order:
1. `bun check` — lint + format
2. `bun typecheck` — TypeScript validation
3. `bunx convex codegen` — regenerate Convex types
4. `bun test convex/dispersal/__tests__/integration.test.ts` — run all 3 scenarios

If any fail, resume agent with error output and fix.
