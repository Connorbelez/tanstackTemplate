# Tasks: ENG-183 Chunk 1 — Full Implementation

## T-001: Add `getAvailableLenderPayableBalance()` query

**File**: `convex/payments/cashLedger/queries.ts`

- Add `getAvailableLenderPayableBalance` query that returns `{ grossBalance, inFlightAmount, availableBalance }`
- Use existing `getCashAccountBalance()` helper
- In-flight amount is hardcoded to `0n` with TODO comment for when transferRequests schema is extended
- Make query `.public()`

## T-002: Create `disbursementGate.ts` with validation functions

**File**: `convex/payments/cashLedger/disbursementGate.ts` (new file)

- Create `DisbursementValidationResult` interface
- Implement `validateDisbursementAmount()` - returns result object, never throws
- Implement `assertDisbursementAllowed()` - throws `ConvexError` with code `DISBURSEMENT_EXCEEDS_PAYABLE`
- Use `ctx.runQuery` to call the internal query wrapper
- Import `ConvexError` from `convex/values`

## T-003: Add internal query wrapper

**File**: `convex/payments/cashLedger/queries.ts`

- Add `getAvailableLenderPayableBalanceInternal` using `internalQuery`
- Returns `{ grossBalance, inFlightAmount, availableBalance }` as plain numbers (via `safeBigintToNumber`)
- This is what `disbursementGate.ts` calls

## T-004: Create unit/integration tests

**File**: `convex/payments/cashLedger/__tests__/disbursementGate.test.ts` (new file)

Write 8 test cases using `describe` blocks:
1. `disbursement within balance → allowed`
2. `disbursement exceeds balance → rejected`
3. `zero balance → any disbursement → rejected`
4. `no accounts → disbursement → rejected`
5. `exact amount = balance → allowed` (boundary)
6. `multiple LENDER_PAYABLE accounts → sum is correct`
7. `after payout reduces balance → previously valid disbursement now rejected`
8. `integration: post payable + payout + validate → correct available balance`

Use existing test infrastructure patterns from `lenderPayableBalance.test.ts`.

## T-005: Document integration contract

**File**: `convex/payments/cashLedger/README.md` (modify, or create if doesn't exist)

Document:
- `getAvailableLenderPayableBalance(lenderId)` signature and return type
- `validateDisbursementAmount()` and `assertDisbursementAllowed()` usage
- When to call (before provider initiation)
- Rejection handling
- Relationship to REQ-251 posting-time constraint
- Known limitation: in-flight deduction deferred

## Quality Gates
After each task, run:
- `bun check` (lint + format)
- `bun typecheck`
- `bunx convex codegen`
- `bun run test` (for test file)
