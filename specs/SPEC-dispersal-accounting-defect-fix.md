# Dispersal Accounting Defect Fix

## PRD

### Overview

This spec fixes the current accounting-domain defect in the dispersal pipeline. The defect is that `createDispersalEntries` rejects an ordinary settled-interest payment when the servicing fee computed from principal exceeds the amount actually settled. The current behavior is visible in [convex/dispersal/createDispersalEntries.ts](../convex/dispersal/createDispersalEntries.ts), where the mutation calls [convex/dispersal/servicingFee.ts](../convex/dispersal/servicingFee.ts) and fails if `servicingFee >= settledAmount`. That makes the system brittle for partial payments, underpayments, and any settlement that is smaller than the monthly fee.

The business goal is to make dispersal accounting correct, deterministic, and auditable:
the system must recognize the full servicing fee that was earned, apply only the cash that was actually collected, and carry any shortfall as an explicit receivable. It must not silently cap the fee, and it must not reject an otherwise valid settlement.

### Business Motivation

The dispersal engine is part of the financial record of the platform. If an auditor asks why a payment was not allocated, the answer cannot be "the fee was larger than the payment, so we dropped the settlement." The system needs to show:

- what was collected,
- what fee was earned,
- what portion of the fee was paid in cash,
- what portion remains receivable,
- what amount was actually distributed to lenders,
- and why that outcome is mathematically reproducible from the source event.

This matters for:

- borrower payment processing,
- lender distribution accuracy,
- servicing revenue recognition,
- compliance reporting,
- and replay/reconstruction of historical cash flows.

### Scope

In scope:

- regular interest settlements,
- partial settlements,
- settlement events whose cash is smaller than the monthly servicing fee,
- late-fee and non-interest obligation types,
- explicit receivable tracking for unpaid servicing fees,
- deterministic reconstruction from persisted rows,
- compatibility with existing dispersal and reconciliation queries.

Out of scope:

- changing the mortgage accrual math in [convex/accrual/interestMath.ts](../convex/accrual/interestMath.ts),
- redesigning the full money ledger,
- changing the payment rail/provider integration,
- changing borrower authorization or collection plan logic,
- changing the payout destination model.

### Requirements

1. `createDispersalEntries` must never reject a valid settlement solely because the servicing fee is larger than the collected cash.
2. The platform must recognize the full earned servicing fee for the period, even when cash is only partially collected.
3. Any unpaid portion of the servicing fee must be recorded as an explicit receivable.
4. Lender disbursement must be computed from the remaining settled cash after servicing fee cash application.
5. Non-interest obligation types must not inherit the regular-interest servicing fee unless their policy explicitly says so.
6. The persisted output must be deterministic and sufficient to reconstruct the same result later from the stored rows alone.
7. Existing downstream readers must continue to function, with additive schema changes only.

### Accounting Policy

This defect fix adopts a split-recognition policy:

- The servicing fee is fully earned according to the fee formula.
- Cash application to the fee is capped by the actual settled amount.
- Any unpaid portion is recognized as a servicing fee receivable in the same transaction.
- Only the cash left after fee application is distributed to lenders.

This is a better accounting model than capping the fee, because capping would hide earned revenue and make historical reconstruction ambiguous. It is also better than rejecting the settlement, because rejection loses the valid payment event.

### Obligation-Type Behavior

For `regular_interest` obligations:

- compute the full monthly servicing fee from principal and annual servicing rate,
- apply up to that amount against the settled cash,
- record the unpaid portion as receivable,
- distribute the remaining cash pro rata to lenders.

For partial settlements of `regular_interest` obligations:

- same as above,
- but if the cash is insufficient to cover the fee, lenders receive zero for that event and the fee shortfall is carried forward as receivable.

For late-fee, principal-repayment, default-workout, renewal, or other non-regular-interest obligations:

- do not apply the regular-interest servicing fee automatically,
- use an explicit policy flag if the business later decides that a fee should apply,
- never charge a fee-on-fee by default.

### Use Cases

1. A borrower pays a regular monthly interest installment that is smaller than the monthly servicing fee. The system records the full fee as earned, records a receivable for the shortfall, and does not reject the settlement.
2. A borrower makes a partial interest payment. The system applies part of the cash to servicing fee, carries the fee shortfall as receivable, and pays lenders only from whatever cash remains.
3. A borrower pays a late fee. The system does not apply the regular servicing fee again.
4. A loan enters a non-interest settlement path, such as principal repayment or a default-related workout. The system uses the explicit policy for that obligation type and does not implicitly reuse the regular-interest fee logic.
5. An auditor replays a historical settlement. The replay produces the same fee-recognition split and lender distributions as the live run.

### Acceptance Criteria

- `createDispersalEntries` succeeds for ordinary settled-interest payments even when the fee exceeds the cash collected.
- The recorded output shows `feeDue`, `feeCashApplied`, `feeReceivable`, and `distributableAmount` explicitly.
- The receivable shortfall is persisted and queryable.
- Lender payout math matches the original cash allocation when replayed from the persisted rows.
- Non-regular-interest obligations do not inherit the regular servicing fee unless configured.
- Existing reconciliation queries still work after the additive schema change.
- The failure described by [convex/dispersal/__tests__/reconciliation.test.ts](../convex/dispersal/__tests__/reconciliation.test.ts) is eliminated by design, not by loosening tests.

## TDD

### Root Cause

The current bug is structural, not cosmetic:

- [convex/dispersal/servicingFee.ts](../convex/dispersal/servicingFee.ts) calculates the monthly fee from principal, which is correct as a fee formula.
- [convex/dispersal/createDispersalEntries.ts](../convex/dispersal/createDispersalEntries.ts) incorrectly treats that fee as a hard threshold that must be fully covered by the settled cash before any dispersal can happen.
- That means ordinary underpaid or partial interest settlements are rejected instead of being accounted for.

The fix is not to change the fee formula. The fix is to change how the fee is applied to cash.

### Target Design

#### Accounting model

Keep the existing servicing-fee formula, but split it into three values for every settlement:

- `feeDue`: the full monthly fee earned for the period,
- `feeCashApplied`: the portion actually paid out of the settled cash,
- `feeReceivable`: the unpaid portion that remains owed.

The settlement waterfall becomes:

1. Determine `feeDue`.
2. Apply `feeCashApplied = min(settledAmount, feeDue)`.
3. Compute `feeReceivable = feeDue - feeCashApplied`.
4. Compute `distributableAmount = settledAmount - feeCashApplied`.
5. Allocate `distributableAmount` pro rata across lender positions.

This keeps the system deterministic and prevents silent loss of earned fee revenue.

#### Data model

Use additive changes to the existing dispersal tables in [convex/schema.ts](../convex/schema.ts):

- `dispersalEntries`
- `servicingFeeEntries`
- `obligations`
- `mortgages`

Recommended schema changes:

- extend `servicingFeeEntries` with `feeDue`, `feeCashApplied`, `feeReceivable`, `policyVersion`, and `sourceObligationType`,
- extend `dispersalEntries.calculationDetails` with the same split fields so the lender distribution row is self-describing,
- keep existing fields for backward compatibility,
- keep `idempotencyKey` and `obligationId` as the replay anchor.

If the implementation prefers a separate receivable table, it must still be append-only and must preserve the same values and ordering. The default recommendation is to keep the receivable state on `servicingFeeEntries` to minimize downstream churn.

#### Mutation behavior

`createDispersalEntries` should:

- validate the settlement date and amount as today,
- fetch the mortgage and obligation,
- derive the servicing-fee policy from obligation type,
- compute `feeDue`,
- compute `feeCashApplied` and `feeReceivable`,
- persist one servicing-fee row,
- persist zero or more lender dispersal rows,
- return the created row ids,
- remain idempotent on `obligationId` plus `idempotencyKey`.

The mutation must not call `throw` just because `feeDue > settledAmount`.

#### Policy rules

Policy should be explicit:

- `regular_interest`: servicing fee applies, split between cash and receivable,
- `late_fee`: no automatic regular servicing fee,
- `principal_repayment`: no automatic regular servicing fee,
- `default_workout` and `renewal`-related settlements: no automatic regular servicing fee unless the policy layer says otherwise.

#### Query behavior

Queries that read `servicingFeeEntries` or `dispersalEntries` must be able to explain:

- total fee due,
- total fee paid in cash,
- total fee still owed,
- and total lender distribution.

The existing reconciliation query surface must remain stable, but it can expose the new split fields.

### Implementation Notes

1. Leave [convex/dispersal/servicingFee.ts](../convex/dispersal/servicingFee.ts) as the pure fee formula unless the policy layer needs a new helper name for clarity.
2. Refactor [convex/dispersal/createDispersalEntries.ts](../convex/dispersal/createDispersalEntries.ts) so fee application happens before the rejection point, and remove the `servicingFee >= settledAmount` failure path.
3. Keep the lender pro-rata math deterministic and continue using the established rounding behavior from [convex/accrual/interestMath.ts](../convex/accrual/interestMath.ts).
4. Preserve the existing `idempotencyKey` flow so retries do not duplicate rows.
5. Preserve the current `created` response contract, but update the payload to include the fee split fields if the caller consumes them.

### Migration Considerations

This is an additive migration if the data model is extended rather than replaced.

Steps:

1. Add the new split fields with safe defaults.
2. Backfill historical `servicingFeeEntries` so `feeDue = amount`, `feeCashApplied = amount`, and `feeReceivable = 0` for already-settled rows that were fully paid.
3. For any existing incomplete or test-seeded records, derive the split values from the existing source rows when possible.
4. Keep legacy readers functioning until all query consumers are updated.

The migration does not need to rewrite lender disbursement amounts; it only needs to make the fee recognition explicit.

### Test Matrix

Add or update tests to cover:

- fee smaller than settlement,
- fee equal to settlement,
- fee larger than settlement,
- zero lender-distributable remainder,
- partial settlement with multiple lender positions,
- late-fee obligation with no regular servicing fee,
- principal-repayment obligation with no regular servicing fee,
- idempotent retry of an already processed obligation,
- deterministic replay of persisted rows,
- reconciliation query compatibility after schema extension.

The failing case currently demonstrated in [convex/dispersal/__tests__/reconciliation.test.ts](../convex/dispersal/__tests__/reconciliation.test.ts) should be rewritten to assert the new split accounting instead of expecting a rejection.

### Rollout and Verification

1. Ship the schema extension first.
2. Ship the `createDispersalEntries` logic change behind the existing call path.
3. Backfill or normalize historical fee rows.
4. Run the dispersal tests and the reconciliation suite.
5. Verify that the same input event produces the same output rows on replay.
6. Verify that lender totals, fee totals, and receivable totals reconcile to the original settled cash.

### Risks

- If the receivable split is not persisted explicitly, reconstruction becomes ambiguous.
- If non-interest obligation types inherit the regular fee path accidentally, the system will double-charge or overstate revenue.
- If rounding behavior changes while fee and distribution math are being split, historical replay will drift.

The design above avoids those risks by keeping the fee formula pure, making the split explicit, and storing the split in the persisted records.
