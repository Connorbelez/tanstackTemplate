# Chunk 02 Context: Tests

## Goal
Write unit tests for the proration logic and integration tests for the principal return flow.

---

## T-010: Unit Tests for Proration Logic

**File:** `convex/payments/transfers/__tests__/principalReturn.logic.test.ts`

Test the pure function `computeProrationAdjustedAmount` from `../principalReturn.logic.ts`:

### Test Cases
1. **Normal adjustment:** `computeProrationAdjustedAmount(100_000, -500)` → `99_500`
2. **Positive adjustment (buyer owes seller):** `computeProrationAdjustedAmount(100_000, 2_500)` → `102_500`
3. **Zero adjustment:** `computeProrationAdjustedAmount(100_000, 0)` → `100_000`
4. **Throws on non-positive result:** `computeProrationAdjustedAmount(100_000, -100_000)` → throws (result is 0)
5. **Throws on negative result:** `computeProrationAdjustedAmount(100_000, -200_000)` → throws
6. **Throws on non-integer result:** `computeProrationAdjustedAmount(100_000, 0.5)` → throws (100000.5 is not integer)

Also test `buildPrincipalReturnIdempotencyKey`:
1. Deterministic: same inputs → same key
2. Different inputs → different keys
3. Format: `principal-return:{dealId}:{sellerId}`

---

## T-011: Integration Tests for Principal Return Flow

**File:** `convex/payments/transfers/__tests__/principalReturn.test.ts`

Look at existing test files in `convex/payments/transfers/__tests__/` for patterns. Use `convex-test` for Convex function testing.

### Test Cases

1. **Creates outbound `lender_principal_return` transfer:**
   - Call `createPrincipalReturn` with valid args
   - Verify transfer record has `direction: "outbound"`, `transferType: "lender_principal_return"`
   - Verify `counterpartyType: "investor"`, `counterpartyId: sellerId`
   - Verify `dealId`, `mortgageId`, `lenderId` are set

2. **Transfer amount includes proration adjustment:**
   - principalAmount=100_000, prorationAdjustment=-500
   - Verify transfer.amount === 99_500

3. **Idempotent per deal+seller combination:**
   - Call twice with same dealId+sellerId
   - Second call returns same transferId

4. **Admin action validates deal is in confirmed state:**
   - Create a deal NOT in `confirmed` status
   - Call `returnInvestorPrincipal` → expect ConvexError

5. **Admin action returns `alreadyExists: true` for existing transfer:**
   - Create a principal return transfer
   - Confirm it
   - Call admin action again → expect `{ alreadyExists: true }`

6. **Pipeline fields passed through when present:**
   - Call with `pipelineId` and `legNumber`
   - Verify transfer record has them

---

## Key Conventions for Tests

- Use `describe`/`it` blocks from Vitest
- Use `convex-test` `convexTest()` for Convex function testing (look at existing test files for the exact pattern)
- No `any` types in tests
- Run `bun run test` to verify all tests pass

## Quality Gate

After completing all tasks:
1. `bun run test` — all tests pass
2. `bun check` — lint + format
3. `bun typecheck` — type checking
