# Tasks: ENG-183 — Disbursement Pre-Validation Gate

## Context
- **Issue**: [ENG-183](https://linear.app/fairlend/issue/ENG-183) — Handoff: Disbursement pre-validation gate (getLenderPayableBalance)
- **Priority**: Urgent | **Estimate**: 2 points
- **Blockers**: ENG-150 (Done ✅), ENG-162 (Done ✅)
- **Blocks**: None
- **Drift**: `getLenderPayableBalance` already exists. In-flight deduction deferred (transferRequests is stub).

## Task List

- [x] **T-001**: Add `getAvailableLenderPayableBalance()` query to `convex/payments/cashLedger/queries.ts`
- [x] **T-002**: Create `convex/payments/cashLedger/disbursementGate.ts` with `validateDisbursementAmount()` and `assertDisbursementAllowed()`
- [x] **T-003**: Create internal query wrapper `getAvailableLenderPayableBalanceInternal`
- [x] **T-004**: Create unit/integration tests in `convex/payments/cashLedger/__tests__/disbursementGate.test.ts`
- [x] **T-005**: Document integration contract in README

## Completion Criteria
- `getAvailableLenderPayableBalance()` returns `{ grossBalance, inFlightAmount, availableBalance }`
- `validateDisbursementAmount()` returns result object (never throws)
- `assertDisbursementAllowed()` throws `ConvexError` with code `DISBURSEMENT_EXCEEDS_PAYABLE`
- All 8 test cases pass
- Contract documented for Unified Payment Rails team
