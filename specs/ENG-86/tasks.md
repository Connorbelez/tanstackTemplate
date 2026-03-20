# ENG-86 Tasks: Reconciliation Query Tests

## Status: 1 task remaining

- [x] T-001: Analyze existing reconciliation.test.ts coverage vs SPEC §8.5 acceptance criteria
- [x] T-002: Add cross-check invariant test (steady ownership, 3 months, 1-day tolerance)

---

## T-002: Add cross-check invariant test

**File**: `convex/dispersal/__tests__/reconciliation.test.ts`

**Acceptance criteria** (from Linear ENG-86):
- Steady ownership 3 months: total accrual ≈ dispersals + fees (within 1 day tolerance)

**Test requirements**:
1. Seed a mortgage (8% annual rate, 10M principal, 1% servicing rate) with steady 100% single-lender ownership
2. Run 3 monthly settlements (Feb/Mar/Apr 2026) through `createDispersalEntries`
3. Compute total accrual for the 3-month period using `calculatePeriodAccrual(annualRate, 1.0, principal, days)`
4. Query total disbursements via `getDisbursementHistory`
5. Query total fees via `getServicingFeeHistory`
6. Assert: `|totalAccrual - (totalDispersals + totalFees)| <= oneDayTolerance`

**Tolerance formula**: `oneDayTolerance = annualRate * principal / 365`
- Example: 0.08 * 10_000_000 / 365 ≈ 2191.78

**Key data** (derived):
- Monthly accrual (28/31/30 days): ≈ 61,370 + 67,945 + 65,753 = 195,068
- Monthly settlement: 100,000
- Monthly servicing fee: 0.01 * 10M / 12 = 8,333.33
- Monthly dispersal: 100,000 - 8,333.33 = 91,666.67
- Total disbursements (3 months): 275,000
- Total fees (3 months): 25,000
- Difference (accrual gap): ~3 days of interest ≈ 6,667 > tolerance

**Wait**: The gap (≈6,667) exceeds 1-day tolerance (≈2,192). Need to re-examine whether the period boundary aligns with the settlement dates.

**Revised approach**: Use 90 days of accrual exactly (Mar 1 to May 31, 2026) where:
- Mar (31 days), Apr (30 days), May (31 days) = 92 days
- Actually: need the settlement to happen at the START of each month, so accrual window is:
  - Feb 1 to Mar 1 = 28 days (settlement on Feb 1, next on Mar 1)
  - Mar 1 to Apr 1 = 31 days
  - Apr 1 to May 1 = 30 days
  - Total: 89 days

But the 1-day tolerance = 2,192 is much smaller than 89 * 2,192 = 195,068 total. The gap of 3 days (≈6,667) > 1-day tolerance (≈2,192).

The issue is that the test window should be exactly the settlement period. Let me check if we need to use the PERIOD ending at the last settlement date, not the full period.

Actually, looking at the dispersal entries in the existing tests - they have `dispersalDate` as the settlement date. The accrual for the period Feb 1 to Apr 30 = 89 days of continuous ownership.

The key insight: after 3 months of continuous ownership and monthly settlements, the "accrual vs disbursed + fees" gap = 3 days of interest (because the last month's interest hasn't been collected yet at Apr 30).

But 3 days × 2,192/day = 6,576 > 1-day tolerance (2,192).

So we need to either:
1. Settle at the END of the period (so all 3 months of interest is fully accrued AND disbursed) - e.g., run settlements on Mar 31, Apr 30, May 31
2. OR use a narrower accrual window (just through the last settlement date, not beyond)

Actually, looking more carefully at the accrual math: accrual FOR the 3-month period from Feb 1 to Apr 30 = 89 days × daily_rate = 195,068.

dispersals + fees = 275,000 + 25,000 = 300,000

The gap = 300,000 - 195,068 = 104,932

That's MUCH larger than the tolerance. This means the test is designed to FAIL with these parameters, OR the accrual window is different.

Let me re-read the UC: "total accrued interest approximately equals total dispersed amounts plus servicing fees"

Hmm, the UC says "approximately equals" - but the tolerance of 1 day is very tight. With 10M principal, 1 day = 2,192.

Actually I think I need to re-read the acceptance criteria more carefully:

"Cross-check: steady ownership 3 months: total accrual ≈ dispersals + fees (within 1 day tolerance)"

The key question is: what is the ACCRUAL window and what are the SETTLEMENT dates?

Looking at the `createDispersalEntries` test, the settlement dates are Feb 1, Mar 1, Apr 1. These are all in 2026. The accrual is computed from the mortgage's `interestAdjustmentDate` (Jan 1) forward.

If the mortgage's first payment date is Feb 1, and we settle on Feb 1, Mar 1, Apr 1:
- From Jan 1 to Feb 1 = 31 days: 8% × 10M × 31/365 = 67,945 of interest accrues
- But the settlement on Feb 1 = 100,000 collected = 91,667 dispersed + 8,333 fee

So after Feb settlement, the accrued interest (67,945) < settled amount (100,000). The DIFFERENCE is that the settlement includes PRINCIPAL repayment too (part of the 100,000).

Wait - looking at the mortgage in the test setup:
- principal: 10_000_000 (10M)
- paymentAmount: 100_000 (100k per month)
- This seems like a typical monthly payment (principal + interest)

So the 100,000 settlement includes BOTH interest AND principal repayment!

For the cross-check:
- The 100,000 monthly payment = interest portion (8% × 10M × 30/365 = 65,753) + principal portion
- But for "accrual ≈ dispersals + fees" we only care about the INTEREST portion

OK so if 100,000 is the total payment (P+I), then:
- Monthly interest = ~65,753
- Monthly principal = ~34,247
- The interest portion is what accrues and gets dispersed
- The principal portion REDUCES the outstanding principal (but in Phase 1, principal repayment goes through the REDEMPTION path, not dispersal!)

From the Dispersal Accounting feature doc:
"Principal repayment is NOT dispersed. Principal at maturity flows through the ownership ledger redemption path (burn shares, return capital), not through dispersal."

So the 100,000 monthly payment = 65,753 (interest to disperse to lenders) + 8,333 (FairLend servicing fee) + ~25,914 (principal returned to investors through redemption) ???

Actually no - looking at the test more carefully, the `settledAmount` in `createDispersalEntries` is 100,000. The dispersal engine takes 100,000, deducts servicing fee (8,333), and distributes the rest (91,667) to lenders.

But 91,667 is for ONE lender with 100% ownership. The disbursement is NOT the interest accrual - it's the SETTLED amount minus fees.

So the cross-check invariant "total_accrual ≈ total_dispersals + total_fees" must mean:
- total_accrual = total interest that ACCRUED over the period
- total_dispersals = total cash actually DISBURSED to lenders (91,667 × 3 = 275,000)
- total_fees = total servicing fees collected (8,333 × 3 = 25,000)

But the TOTAL SETTLED = 300,000. And total accrual (interest for 3 months) = ~195,000.

So 195,000 ≈ 275,000 + 25,000 = 300,000? NO!

The 300,000 includes PRINCIPAL. The interest accrual is only ~195,000.

So the cross-check must be:
- total_accrual ≈ disbursements_for_interest_only + fees

If all 100,000 is interest (no principal), then:
- Total accrual = ~195,000
- Dispersals = ~275,000 (which is MORE than accrual - this can't be right)

I'm confusing myself. Let me re-read the createDispersalEntries test:

```typescript
const result = await runCreateDispersal(t, {
  settledAmount: 100_000,  // This is what the borrower PAID
  settledDate: "2026-03-01",
  ...
});
// result.entries[0].amount = 55_000 for lender 1
// result.entries[1].amount = 36_667 for lender 2
// total dispersal = 91,667
// servicing fee = 8,333
// 91,667 + 8,333 = 100,000 ✓
```

So the 100,000 is the TOTAL collected from the borrower. It gets split:
- 91,667 to lenders (their share of the collected interest + principal)
- 8,333 to FairLend (servicing fee)

For the CROSS-CHECK with steady 100% ownership:
- Monthly settlement = 100,000
- Lender gets 91,667/month (since 100% ownership)
- Fee = 8,333/month
- After 3 months: disbursements = 275,001, fees = 24,999

Now, what is the total accrual for the 3 months?

If the mortgage accrues interest DAILY at 8% on the FULL 10M principal:
- Daily accrual = 0.08 × 10M / 365 = 2,191.78
- Monthly accrual ≈ 2,191.78 × 30.44 = 66,739
- 3-month accrual ≈ 200,218

But wait - the SETTLED amount is 100,000/month. And 100,000 > 66,739 monthly accrual. This means the settlement includes principal repayment!

So the cross-check should be:
- Accrual (3 months) ≈ 200,218 (interest portion only)
- But dispersal (3 months) = 275,001 (this includes principal repayment!)
- The disbursements INCLUDE principal, not just interest

This doesn't make sense as a cross-check unless we're comparing like-for-like amounts.

Actually, maybe the settlement amounts in the test are INTEREST ONLY (not P+I). Let me look at what "amount" means in the obligation table:
- amount: 100,000 (what's due)
- amountSettled: 100,000 (what was actually paid)

If this is interest-only, then:
- Monthly interest accrual ≈ 66,739
- Monthly settlement = 100,000
- Difference = 33,261 (goes where?)

In an interest-only mortgage, the principal stays constant and the monthly payment = interest only. So 100,000/month × 12 months = 1.2M/year on a 10M mortgage = 12% yield. But the stated rate is 8%.

So the mortgage must be amortizing (P+I payments). The monthly payment of 100,000 includes principal reduction.

For the dispersal engine, it doesn't care about the split - it just takes the settled amount and distributes it. The PRINCIPAL portion of the payment is ALSO distributed to lenders (pro-rata by ownership), not kept in the pool.

So after 3 months of 100,000 settlements = 300,000 total collected. Of that:
- 275,001 goes to lenders (dispersal entries)
- 24,999 goes to FairLend (servicing fees)
- 0 goes to principal redemption (that's a separate ledger entry)

The cross-check would then be:
- 3-month accrual ≈ 200,218 (interest that accrued)
- Dispersals (3 months) = 275,001 (this is LARGER than accrual!)
- 275,001 + 24,999 = 300,000

So the cross-check formula "accrual ≈ disbursements + fees" must mean:
- accrual = 200,218 (interest accrued)
- disbursements + fees = 275,001 + 24,999 = 300,000 (total cash out)

These are NOT approximately equal unless the settlement amount = monthly accrual + principal repayment.

OK so for this to work:
- Settled amount (100,000) must be the total payment (P+I)
- The dispersal distributes BOTH interest AND principal to lenders (pro-rata)
- So dispersal = principal_returned + interest_to_lenders

With 100% ownership:
- Monthly dispersal = 100,000 - 8,333 (fee) = 91,667
- This 91,667 includes principal return + interest payment

For the cross-check to work:
- Accrual = interest accrued on the OUTSTANDING principal
- But with amortizing mortgage, outstanding principal DECREASES each month
- So month 1: 10M × 8% × 30/365 = 65,753 (interest on full 10M)
- Month 2: 9.67M × 8% × 30/365 = 63,562 (interest on reduced principal)
- etc.

This gets complex. The test specification must use a SIMPLE scenario where the math works out.

Actually, I think the test is designed to verify that for a MORTGAGE (not the whole portfolio):
- Accrual (3 months of daily interest) ≈ Sum of all dispersal entries (all lenders) + Sum of all fee entries

With 100% ownership and 3 months of settlements:
- Accrual = daily_rate × days_in_period
- Dispersals = 3 × (settlement - fee)
- Fees = 3 × fee

If the settlement = interest + principal repayment:
- total_disbursements = total_principal_returned + total_interest_to_lenders
- total_accrual = total_interest_accrued (NOT including principal)

These won't be equal unless we account for principal separately.

I think I'm overcomplicating this. Let me just write the test based on the SPEC and see what happens. The tolerance is "within 1 day tolerance" = daily_rate ≈ 2,192. The gap between accrual and (disbursements + fees) should be within this tolerance.

For the test to pass, the gap must be ≤ 2,192. With 3 months:
- If accrual = 195,068 (89 days on full principal)
- And disbursements + fees = 300,000 (3 × 100,000)
- Gap = 104,932 which is WAY larger than 2,192

So the settlement amount must NOT be 100,000 if we're checking accrual ≈ dispersals + fees.

Maybe the test should use:
- Small principal (e.g., 100,000) so the daily_rate × 3 months is comparable to the settlement
- Or the settlement is just the interest portion (not P+I)

Actually, let me re-read the SPEC to find the exact numbers. The REQ-235 says:
"Five reconciliation queries must return accurate results"

And the Acceptance Criteria says:
"Cross-check: total accrual ≈ dispersals + fees (within 1-day tolerance)"

With 10M principal and 8% rate:
- Daily rate = 2,192
- 1-day tolerance = 2,192

For the gap to be ≤ 2,192 after 3 months:
- The difference between accrual and (disbursements + fees) must be ≤ 2,192

Given:
- accrual ≈ 0.08 × 10M × 89/365 = 195,068
- disbursements + fees = 3 × 100,000 = 300,000 (if settlement = 100,000/month)
- gap = 104,932

This is 48× the tolerance. Something is fundamentally wrong.

Wait - maybe the 3 monthly settlements are NOT all interest accrual. The mortgage might be in its EARLY stages where payments are mostly interest. With 10M at 8%, monthly payment ≈ 100,000 would be roughly:
- Month 1 interest: 10M × 8%/12 = 66,667
- Month 1 principal: 100,000 - 66,667 = 33,333
- Month 2 interest: (10M - 33,333) × 8%/12 ≈ 66,444

The difference in monthly interest is small (~333/month). So the accrual is close to the settled interest amount.

But 100,000 × 3 = 300,000 vs accrual of ~200,000 = 100,000 gap. That gap IS principal repayment. But in Phase 1, principal is NOT dispersed - it goes through the REDEMPTION path (burn shares, return capital).

So the dispersal entries only contain the INTEREST portion + servicing fee, NOT principal.

Let me look at the `calculationDetails` in the dispersal entries:
- `settledAmount`: the total collected (100,000)
- `servicingFee`: 8,333
- `distributableAmount`: 91,667 (this is what goes to lenders)
- `roundedAmount`: 91,667 (for 100% ownership)

So the dispersal entry amount (91,667) = distributable amount = settledAmount - servicingFee.

For 100% ownership:
- dispersal amount = 91,667
- This 91,667 represents: (interest portion of payment) - servicing_fee

Actually, the disbursement IS the net amount after fees, so dispersal amount = settledAmount - servicingFee. The settled amount covers both principal and interest collected from the borrower, so I need to figure out how much of that 100,000 is actually interest versus principal reduction. With a 10M mortgage at 8% monthly rate, the interest portion of the first payment would be around 66,667, leaving roughly 33,333 for principal—but the servicing fee comes out of the interest portion first.

Let me simplify this and just run the test to see what happens. I need to create a setup where one lender holds 100% of the shares starting from January 1st through the test period, and then execute three settlement cycles to generate the dispersal records.
