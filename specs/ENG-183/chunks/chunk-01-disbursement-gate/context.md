# Chunk 01 Context: Disbursement Pre-Validation Gate

## Overview
ENG-183 adds a pre-initiation guard that prevents outbound disbursements exceeding a lender's available payable balance. The Cash Ledger is the source of truth; Unified Payment Rails is the consumer.

## Key Drift from Notion Plan
The Notion plan said transferRequests was a "stub without lenderId/amount/direction". The actual schema NOW has these fields (optional). We implement full in-flight deduction.

## Files to Modify
1. `convex/schema.ts` — Add `by_lender_and_status` index to transferRequests
2. `convex/payments/cashLedger/queries.ts` — Add getAvailableLenderPayableBalance + internal variant
3. `convex/payments/cashLedger/disbursementGate.ts` — NEW: validation gate functions
4. `convex/payments/cashLedger/__tests__/disbursementGate.test.ts` — NEW: 8 test cases

## Existing Code Patterns

### cashLedgerQuery middleware (from convex/fluent.ts)
All cash ledger queries use `cashLedgerQuery` from fluent.ts. It provides auth + permission gating.

### Existing getLenderPayableBalance (queries.ts:89-101)
```typescript
export const getLenderPayableBalance = cashLedgerQuery
  .input({ lenderId: v.id("lenders") })
  .handler(async (ctx, args) => {
    const accounts = await ctx.db
      .query("cash_ledger_accounts")
      .withIndex("by_lender", (q) => q.eq("lenderId", args.lenderId))
      .collect();

    return accounts
      .filter((account) => account.family === "LENDER_PAYABLE")
      .reduce((sum, account) => sum + getCashAccountBalance(account), 0n);
  })
  .public();
```

### Existing internalGetLenderPayableBalance (queries.ts:451-465)
```typescript
export const internalGetLenderPayableBalance = internalQuery({
  args: { lenderId: v.id("lenders") },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("cash_ledger_accounts")
      .withIndex("by_lender", (q) => q.eq("lenderId", args.lenderId))
      .collect();

    const total = accounts
      .filter((a) => a.family === "LENDER_PAYABLE")
      .reduce((sum, a) => sum + getCashAccountBalance(a), 0n);

    return safeBigintToNumber(total);
  },
});
```

### accounts.ts helpers
- `getCashAccountBalance(account)` → returns bigint (credit-normal: credits - debits)
- `safeBigintToNumber(value)` → converts bigint to number, throws if unsafe
- `findCashAccount(db, spec)` → finds account by CashAccountSpec

### types.ts
- `CashAccountFamily` — union type including "LENDER_PAYABLE"
- `CREDIT_NORMAL_FAMILIES` — Set including "LENDER_PAYABLE"

### transferRequests schema (schema.ts:1408-1436)
```
transferRequests: defineTable({
  status: v.union(pending | approved | processing | completed | confirmed | reversed | failed | cancelled),
  direction: v.optional(v.union("inbound", "outbound")),
  transferType: v.optional(v.string()),
  amount: v.optional(v.number()),
  currency: v.optional(v.string()),
  mortgageId: v.optional(v.id("mortgages")),
  obligationId: v.optional(v.id("obligations")),
  lenderId: v.optional(v.id("lenders")),
  borrowerId: v.optional(v.id("borrowers")),
  dispersalEntryId: v.optional(v.id("dispersalEntries")),
  confirmedAt: v.optional(v.number()),
  reversedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_status_and_direction", ["status", "direction"])
  .index("by_mortgage", ["mortgageId", "status"])
  .index("by_obligation", ["obligationId"])
  .index("by_dispersal_entry", ["dispersalEntryId"]),
```

### Test patterns (from testUtils.ts)
- `createHarness(modules)` — creates convexTest with schema, disables hash chain
- `seedMinimalEntities(t)` — returns { borrowerId, lenderAId, lenderBId, mortgageId }
- `createTestAccount(t, spec)` — creates cash_ledger_accounts with optional initial balances
- `createConfirmedTransfer(t, args)` — creates transferRequests with status "confirmed"
- `postTestEntry(t, args)` — convenience wrapper for postCashEntryInternal
- `SYSTEM_SOURCE` — { channel: "scheduler", actorId: "system", actorType: "system" }

### Existing test pattern for calling internal queries/mutations in tests
```typescript
interface InternalGetLenderPayableBalanceHandler {
  _handler: (ctx: QueryCtx, args: { lenderId: Id<"lenders"> }) => Promise<number>;
}
const internalGetLenderPayableBalanceQuery =
  internalGetLenderPayableBalance as unknown as InternalGetLenderPayableBalanceHandler;
// Then call: await internalGetLenderPayableBalanceQuery._handler(ctx, { lenderId });
```

### Creating in-flight transfer records for tests
Use direct ctx.db.insert in t.run() blocks. testUtils.ts already has createConfirmedTransfer as a pattern:
```typescript
export async function createConfirmedTransfer(t, args) {
  return t.run(async (ctx) => {
    return ctx.db.insert("transferRequests", {
      status: "confirmed",
      direction: args.direction,
      amount: args.amount,
      currency: "CAD",
      // ... optional fields
    });
  });
}
```

## Implementation Details

### T-001: Add index to transferRequests
Add `.index("by_lender_and_status", ["lenderId", "status"])` to the transferRequests table definition in schema.ts. Add it after the existing indexes.

### T-002: getAvailableLenderPayableBalance query
Add after the existing getLenderPayableBalance query (line 101). Use cashLedgerQuery middleware.

Logic:
1. Get gross payable balance (reuse existing pattern from getLenderPayableBalance)
2. Query in-flight outbound transfers: status in ["pending", "approved", "processing"], direction = "outbound", lenderId matches
3. Sum their amounts (skip records with null amount — legacy stubs)
4. Return { grossBalance: bigint, inFlightAmount: bigint, availableBalance: bigint }

In-flight query approach: Use the new `by_lender_and_status` index. Query 3 times (once per in-flight status) and sum. Filter for direction === "outbound" and amount !== undefined in memory.

### T-003: internalGetAvailableLenderPayableBalance
Add after the existing internalGetLenderPayableBalance (line 465). Use internalQuery. Returns numbers via safeBigintToNumber.

Extract the shared logic into a helper function `getAvailableLenderPayableBalanceImpl(ctx, lenderId)` that both the public and internal queries call.

### T-004: disbursementGate.ts
Create `convex/payments/cashLedger/disbursementGate.ts`.

Exports:
- `validateDisbursementAmount(ctx, { lenderId, requestedAmount })` — returns DisbursementValidationResult
- `assertDisbursementAllowed(ctx, { lenderId, requestedAmount })` — throws ConvexError if exceeds

DisbursementValidationResult interface:
```typescript
export interface DisbursementValidationResult {
  allowed: boolean;
  availableBalance: number; // cents, safe integer
  requestedAmount: number;
  reason?: string;
}
```

The functions call the shared impl from queries.ts internally (import the helper, don't call the Convex query).

### T-005: disbursementGate.test.ts
8 test cases:
1. Lender with payable balance → disbursement within balance → allowed
2. Lender with payable balance → disbursement exceeds balance → rejected
3. Lender with zero balance → any disbursement → rejected
4. Lender with no accounts → disbursement → rejected (balance = 0)
5. Exact amount = balance → allowed (boundary)
6. Multiple LENDER_PAYABLE accounts for same lender → sum is correct
7. After payout reduces balance → disbursement that was valid is now rejected
8. Integration: in-flight outbound transfers reduce available balance

For test 8, create transferRequests records with status "pending"/"processing", direction "outbound", lenderId, and amount. Verify the available balance is reduced by the in-flight amount.

## Constraints
- getLenderPayableBalance (existing) is read-only — never modifies state
- BigInt at boundary: public query returns bigint, internal query converts via safeBigintToNumber
- The gate functions take QueryCtx, not MutationCtx — they are read-only validators
- Use ConvexError (not Error) for structured error codes
- IN_FLIGHT_STATUSES = ["pending", "approved", "processing"] as const
