# Chunk 05 Context: Existing Test Modifications + Final Verification

## Goal
Add missing edge case tests to existing test files and run full verification suite.

## Files to Modify

### 1. `convex/payments/cashLedger/__tests__/integration.test.ts`
Add these tests to the existing `describe("cash ledger integrations")` block:

```typescript
it("rejects zero-amount entry")
it("rejects negative-amount entry")
it("rejects debit === credit same account")
```

These use the existing `seedCoreEntities` and `createUpcomingObligation` helpers.

For the zero/negative tests:
- Use `postCashEntryInternal` directly inside `t.run`
- Create valid debit/credit accounts
- Call with `amount: 0` or `amount: -100` → expect throw matching `/positive safe integer/`

For the debit===credit test:
- Create one account
- Call with same account ID for both debit and credit → expect throw matching `/must be different/`

### 2. `convex/payments/cashLedger/__tests__/constraintsAndBalanceExemption.test.ts`
Add this test to a new describe block or the existing `balanceCheck` describe:

```typescript
it("SUSPENSE_ESCALATED skips balance check (like REVERSAL/CORRECTION)")
```

Setup:
1. Create a SUSPENSE account with 0 balance
2. Create a BORROWER_RECEIVABLE account with 0 balance
3. Post a SUSPENSE_ESCALATED entry: debit SUSPENSE, credit BORROWER_RECEIVABLE
4. Should succeed despite both accounts having 0 balance (balance check skipped)

## Existing File Structure

### integration.test.ts
Already has:
- `seedCoreEntities(t)` — creates full entity graph
- `createUpcomingObligation(t, args)` — creates obligation with accrual
- `createSettledObligation(t, args)` — creates settled obligation with accounts
- 4 existing tests covering lifecycle flows

### constraintsAndBalanceExemption.test.ts
Already has:
- `seedAccountsForConstraintTests(t)` — BORROWER_RECEIVABLE + CONTROL accounts + seed entry
- `seedAccountsForBalanceTests(t)` — BORROWER_RECEIVABLE + TRUST_CASH + CONTROL accounts
- CORRECTION constraint tests (5 tests)
- REVERSAL constraint tests (2 tests)
- Balance exemption tests (2 tests)

## Verification Steps (T-024, T-025)

### Quality Gate Commands
```bash
bunx convex codegen
bun check
bun typecheck
bun run test
```

All must pass. `bun check` auto-formats and fixes some linting issues — run it first before trying to fix lint errors manually.

### No `any` Types
Search all test files for `any` usage:
```bash
grep -n '\bany\b' convex/payments/cashLedger/__tests__/*.test.ts
```
Should find zero instances (excluding `v.any()` in schema which is existing).

### No Floating Point
Search for floating-point arithmetic in test assertions:
- No `0.01`, `100.50`, etc. in amount values
- All amounts should be integers: `100_000`, `50_000`, `1000`
- All balance checks should compare against `bigint` values: `100_000n`
- No `Math.floor`, `Math.round`, `toFixed` in test files
