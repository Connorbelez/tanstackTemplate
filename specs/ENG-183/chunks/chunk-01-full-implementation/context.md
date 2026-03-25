# Context: ENG-183 — Disbursement Pre-Validation Gate

## Linear Issue
- **Title**: Handoff: Disbursement pre-validation gate (getLenderPayableBalance)
- **Priority**: Urgent | **Estimate**: 2 points
- **Blockers**: ENG-150 (Done ✅), ENG-162 (Done ✅)
- **Blocks**: None

## Integration Contract
```typescript
const balance = await getLenderPayableBalance(lenderId);
if (transferRequest.amount > balance) {
  throw new Error(
    `Disbursement of ${transferRequest.amount} exceeds payable balance of ${balance}`
  );
}
```

## Direction of Data Flow
- Cash Ledger is the **source** (queried)
- Unified Payment Rails is the **consumer** (validates)
- The ledger never initiates transfers; it provides the truth that the rails check against

## Implementation Details

### Step 1: `getAvailableLenderPayableBalance()` query

**File**: `convex/payments/cashLedger/queries.ts` (modify)

```typescript
/**
 * Returns the available (disbursable) payable balance for a lender.
 * Available = gross payable balance - in-flight outbound transfers.
 *
 * Phase 5: In-flight deduction is a no-op because transferRequests
 * schema doesn't yet have lenderId/amount/direction fields.
 * The posting-time constraint (ENG-162 REQ-251) provides the safety net.
 *
 * TODO(ENG-UPR): Deduct in-flight transfers when transferRequests
 * schema includes lenderId, amount, direction, and transferType.
 */
export const getAvailableLenderPayableBalance = cashLedgerQuery
  .input({ lenderId: v.id("lenders") })
  .handler(async (ctx, args) => {
    // 1. Get gross payable balance (existing logic)
    const accounts = await ctx.db
      .query("cash_ledger_accounts")
      .withIndex("by_lender", (q) => q.eq("lenderId", args.lenderId))
      .collect();

    const grossBalance = accounts
      .filter((a) => a.family === "LENDER_PAYABLE")
      .reduce((sum, a) => sum + getCashAccountBalance(a), 0n);

    // 2. TODO: Deduct in-flight outbound transfers
    // const inFlightAmount = await getInFlightPayoutAmount(ctx, args.lenderId);
    const inFlightAmount = 0n;

    return {
      grossBalance,
      inFlightAmount,
      availableBalance: grossBalance - inFlightAmount,
    };
  })
  .public();
```

### Step 2: `validateDisbursementAmount()` function

**File**: `convex/payments/cashLedger/disbursementGate.ts` (create new)

```typescript
import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { safeBigintToNumber } from "./accounts";

export interface DisbursementValidationResult {
  allowed: boolean;
  availableBalance: number; // cents, safe integer
  requestedAmount: number;
  reason?: string;
}

/**
 * Pre-initiation guard: validates that a disbursement amount does not
 * exceed the lender's available payable balance.
 */
export async function validateDisbursementAmount(
  ctx: QueryCtx,
  args: {
    lenderId: Id<"lenders">;
    requestedAmount: number; // cents
  }
): Promise<DisbursementValidationResult> {
  const result = await ctx.runQuery(
    internal.getAvailableLenderPayableBalanceInternal,
    { lenderId: args.lenderId }
  );

  const available = result.availableBalance;

  if (args.requestedAmount > available) {
    return {
      allowed: false,
      availableBalance: available,
      requestedAmount: args.requestedAmount,
      reason: `Disbursement of ${args.requestedAmount} exceeds available balance of ${available}`,
    };
  }

  return {
    allowed: true,
    availableBalance: available,
    requestedAmount: args.requestedAmount,
  };
}

/**
 * Throwing variant — convenience for callers that want hard failure.
 */
export async function assertDisbursementAllowed(
  ctx: QueryCtx,
  args: {
    lenderId: Id<"lenders">;
    requestedAmount: number;
  }
): Promise<void> {
  const result = await validateDisbursementAmount(ctx, args);
  if (!result.allowed) {
    throw new ConvexError({
      code: "DISBURSEMENT_EXCEEDS_PAYABLE" as const,
      requestedAmount: args.requestedAmount,
      availableBalance: result.availableBalance,
      lenderId: args.lenderId,
    });
  }
}
```

### Step 3: Internal query wrapper

**File**: `convex/payments/cashLedger/queries.ts` (modify)

```typescript
export const getAvailableLenderPayableBalanceInternal = internalQuery({
  args: { lenderId: v.id("lenders") },
  handler: async (ctx, args) => {
    const result = await getAvailableLenderPayableBalanceImpl(ctx, args.lenderId);
    return {
      grossBalance: safeBigintToNumber(result.grossBalance),
      inFlightAmount: safeBigintToNumber(result.inFlightAmount),
      availableBalance: safeBigintToNumber(result.availableBalance),
    };
  },
});
```

### Step 4: Tests (8 cases)

**File**: `convex/payments/cashLedger/__tests__/disbursementGate.test.ts` (create)

Test cases:
1. **Lender with payable balance → disbursement within balance → allowed**
2. **Lender with payable balance → disbursement exceeds balance → rejected**
3. **Lender with zero balance → any disbursement → rejected**
4. **Lender with no accounts → disbursement → rejected (balance = 0)**
5. **Exact amount = balance → allowed** (edge case: boundary condition)
6. **Multiple LENDER_PAYABLE accounts for same lender → sum is correct**
7. **After payout reduces balance → disbursement that was previously valid is now rejected**
8. **Integration: Post payable entries + payout + validate → correct available balance**

### Step 5: Documentation

**File**: `convex/payments/cashLedger/README.md` (modify)

Document:
- Function name and signature
- Return type
- When to call (before provider initiation)
- What to do on rejection
- Relationship to posting-time REQ-251 constraint
- Known limitation: in-flight deduction not yet implemented

## Constraints
- `getLenderPayableBalance` is **read-only** — never modifies state
- **BigInt at boundary**: Public query returns `bigint`. Internal query converts via `safeBigintToNumber()`
- **In-flight deduction deferred** until `transferRequests` schema extended
- **This is a handoff** — Cash Ledger provides query; Unified Payment Rails owns transfer initiation

## Existing Code Reference

From GitNexus, the existing `getLenderPayableBalance` in `queries.ts:89-101`:

```typescript
export const getLenderPayableBalance = cashLedgerQuery
  .input({ lenderId: v.id("lenders") })
  .handler(async (ctx, args) => {
    const accounts = await ctx.db
      .query("cash_ledger_accounts")
      .withIndex("by_lender", (q) => q.eq("lenderId", args.lenderId))
      .collect();

    const balance = accounts
      .filter((a) => a.family === "LENDER_PAYABLE")
      .reduce((sum, a) => sum + getCashAccountBalance(a), 0n);

    return safeBigintToNumber(balance);
  })
  .public();
```

## File Map
| File | Action | Purpose |
|------|--------|---------|
| `convex/payments/cashLedger/queries.ts` | Modify | Add `getAvailableLenderPayableBalance` + internal wrapper |
| `convex/payments/cashLedger/disbursementGate.ts` | Create | `validateDisbursementAmount()` + `assertDisbursementAllowed()` |
| `convex/payments/cashLedger/__tests__/disbursementGate.test.ts` | Create | 8 test cases |
