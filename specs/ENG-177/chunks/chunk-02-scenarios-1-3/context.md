# Chunk 2 Context: E2E Scenarios 1–3

## What You're Building
The main E2E lifecycle test file with scenarios 1-3 (happy path, partial settlement, multi-lender split).

## File: `convex/payments/cashLedger/__tests__/e2eLifecycle.test.ts` (NEW)

## Test Pattern

```typescript
import { describe, expect, it } from "vitest";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import { createDispersalEntries } from "../../../dispersal/createDispersalEntries";
import { getCashAccountBalance, getOrCreateCashAccount } from "../accounts";
import {
  postObligationAccrued,
  postCashReceiptForObligation,
  postSettlementAllocation,
  postObligationWaiver,
  postObligationWriteOff,
  postCashCorrectionForEntry,
} from "../integrations";
import { postLenderPayout } from "../mutations";
import { getPostingGroupSummary, isPostingGroupComplete } from "../postingGroups";
import { getJournalSettledAmountForObligation } from "../reconciliation";
import { buildIdempotencyKey } from "../types";
import {
  assertFullConservation,
  assertObligationConservation,
  assertPostingGroupComplete,
  assertSettlementReconciles,
  assertAccountIntegrity,
} from "./e2eHelpers";
import {
  createDueObligation,
  createHarness,
  seedMinimalEntities,
  SYSTEM_SOURCE,
  ADMIN_SOURCE,
  type TestHarness,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");
```

## Key Integration Functions

### 1. postObligationAccrued (integrations.ts)
```typescript
// Posts OBLIGATION_ACCRUED: Debit BORROWER_RECEIVABLE, Credit CONTROL:ACCRUAL
// Auto-creates accounts via getOrCreateCashAccount
await postObligationAccrued(ctx, {
  obligationId,
  source: SYSTEM_SOURCE,
});
```

### 2. postCashReceiptForObligation (integrations.ts)
```typescript
// Posts CASH_RECEIVED: Debit TRUST_CASH, Credit BORROWER_RECEIVABLE
// Requires existing BORROWER_RECEIVABLE (created by accrual step)
await postCashReceiptForObligation(ctx, {
  obligationId,
  amount: 100_000,
  idempotencyKey: buildIdempotencyKey("cash-received", obligationId),
  source: SYSTEM_SOURCE,
});
```

### 3. postSettlementAllocation (integrations.ts)
```typescript
// Posts multi-entry allocation: LENDER_PAYABLE_CREATED per lender + SERVICING_FEE_RECOGNIZED
// Validates: sum of lender amounts + servicingFee === obligation.amount
// postingGroupId = `allocation:${obligationId}`
await postSettlementAllocation(ctx, {
  obligationId,
  mortgageId,
  settledDate: "2026-03-01",
  servicingFee: 833,  // annualServicingRate 0.01 * 10_000_000 / 12 = ~8333, but for 100_000 obligation: see note
  entries: [
    { dispersalEntryId: dispersalA, lenderId: lenderAId, amount: 59500 },
    { dispersalEntryId: dispersalB, lenderId: lenderBId, amount: 39667 },
  ],
  source: SYSTEM_SOURCE,
});
```

**IMPORTANT: Servicing fee calculation for tests.**
The mortgage has `annualServicingRate: 0.01`, `paymentFrequency: "monthly"`, `principal: 10_000_000`.
For a 100_000 cent obligation, the fee = `Math.round(0.01 * 10_000_000 / 12)` = 8333 cents.
But the postSettlementAllocation validates `lenderAmounts + servicingFee === obligation.amount`.
So for a 100_000 obligation: lenderAmounts + servicingFee must = 100_000.
With 60/40 split and fee of 8333: lenderA = 54999, lenderB = 36668, fee = 8333, total = 100_000.

Actually, the dispersal engine handles the math. For E2E tests, you can either:
1. Call `createDispersalEntries` to get actual amounts, then feed them to `postSettlementAllocation`
2. Or compute directly: fee first, then split remainder 60/40

**Recommended approach**: Use `createDispersalEntries` mutation handler to get real dispersal entry IDs and amounts, then pass those to `postSettlementAllocation`. This is the real pipeline.

### 4. postLenderPayout (mutations.ts — internalMutation)
```typescript
// Posts LENDER_PAYOUT_SENT: Debit LENDER_PAYABLE, Credit TRUST_CASH
// Requires existing LENDER_PAYABLE and TRUST_CASH accounts
// Access via: (postLenderPayout as unknown as { _handler: ... })._handler(ctx, args)
const postLenderPayoutMutation = postLenderPayout as unknown as {
  _handler: (ctx: MutationCtx, args: {
    mortgageId: Id<"mortgages">;
    lenderId: Id<"lenders">;
    amount: number;
    effectiveDate: string;
    idempotencyKey: string;
    source: typeof SYSTEM_SOURCE;
    reason?: string;
  }) => Promise<unknown>;
};

await postLenderPayoutMutation._handler(ctx, {
  mortgageId,
  lenderId: lenderAId,
  amount: lenderAPayableAmount,
  effectiveDate: "2026-03-01",
  idempotencyKey: buildIdempotencyKey("lender-payout", lenderAId),
  source: SYSTEM_SOURCE,
});
```

### 5. createDispersalEntries (dispersal/createDispersalEntries.ts — internalMutation)
```typescript
// Creates dispersal entries based on ownership ledger positions (60/40 split)
// Returns: { created, entries: [{ id, lenderId, amount, ... }], servicingFeeEntryId }
const createDispersalEntriesMutation = createDispersalEntries as unknown as {
  _handler: (ctx: MutationCtx, args: {
    obligationId: Id<"obligations">;
    mortgageId: Id<"mortgages">;
    settledAmount: number;
    settledDate: string;
    idempotencyKey: string;
    source: typeof SYSTEM_SOURCE;
  }) => Promise<{
    created: boolean;
    entries: Array<{
      id: Id<"dispersalEntries">;
      lenderId: Id<"lenders">;
      amount: number;
      rawAmount: number;
      units: number;
    }>;
    servicingFeeEntryId: Id<"servicingFeeEntries"> | null;
  }>;
};
```

## seedMinimalEntities Returns
```typescript
const { borrowerId, lenderAId, lenderBId, mortgageId } = await seedMinimalEntities(t);
// mortgage: principal=10_000_000, annualServicingRate=0.01, paymentAmount=100_000, paymentFrequency="monthly"
// ownership: lenderA=6000 units (60%), lenderB=4000 units (40%)
```

## Scenario Details

### Scenario 1: Happy Path
1. Seed entities + create due obligation (100,000 cents)
2. Accrue: `postObligationAccrued` → creates BORROWER_RECEIVABLE (debit 100k) + CONTROL:ACCRUAL (credit 100k)
3. Receive cash: `postCashReceiptForObligation` → TRUST_CASH (debit 100k), BORROWER_RECEIVABLE (credit 100k)
4. Update obligation to settled (patch amountSettled = 100_000, status = "settled")
5. Create dispersal entries: `createDispersalEntries._handler` → get real entry IDs + amounts
6. Post settlement allocation: `postSettlementAllocation` with dispersal entries + servicing fee
7. Payout each lender: `postLenderPayout._handler` for lenderA and lenderB
8. Assert: `assertFullConservation` passes

### Scenario 2: Partial Settlement
1. Seed entities + create due obligation (100,000 cents)
2. Accrue receivable
3. First payment: 60,000 cents via `postCashReceiptForObligation`
4. Second payment: 40,000 cents via `postCashReceiptForObligation` (different idempotencyKey)
5. Update obligation to settled
6. Create dispersal entries + post allocation
7. Assert journal-derived settled = 100,000 (sum of both receipts)
8. Assert conservation

### Scenario 3: Multi-Lender Split
1. Same as Scenario 1 through allocation
2. Verify lender A payable amount is ~60% of (obligation - fee)
3. Verify lender B payable amount is ~40% of (obligation - fee)
4. Payout both lenders
5. Verify LENDER_PAYABLE balances are zero after payout
6. Assert conservation

## Posting Group Convention
- Settlement allocation: `allocation:${obligationId}`
- All entries in an allocation share this postingGroupId

## Constraints
- All assertions use BigInt — no floating-point
- Use `t.run(async (ctx) => ...)` for all Convex operations
- Hash-chain is disabled via createHarness (DISABLE_CASH_LEDGER_HASHCHAIN=true)
- Use `buildIdempotencyKey` from types.ts for idempotency keys
- SYSTEM_SOURCE = `{ channel: "scheduler", actorId: "system", actorType: "system" }`
