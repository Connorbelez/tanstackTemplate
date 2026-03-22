# Chunk 01: Implementation Changes

## Tasks

### T-001: Update CASH_ENTRY_TYPE_FAMILY_MAP
**File**: `convex/payments/cashLedger/types.ts`
**Change**: Add `"UNAPPLIED_CASH"` to the `credit` array of `CASH_RECEIVED` in `CASH_ENTRY_TYPE_FAMILY_MAP`.

Currently:
```typescript
CASH_RECEIVED: {
  debit: ["TRUST_CASH", "CASH_CLEARING", "UNAPPLIED_CASH"],
  credit: ["BORROWER_RECEIVABLE"],
},
```

After:
```typescript
CASH_RECEIVED: {
  debit: ["TRUST_CASH", "CASH_CLEARING", "UNAPPLIED_CASH"],
  credit: ["BORROWER_RECEIVABLE", "UNAPPLIED_CASH"],
},
```

**Why**: Overpayment routing posts a CASH_RECEIVED entry that credits UNAPPLIED_CASH instead of BORROWER_RECEIVABLE. The family check (Step 4 of posting pipeline) will reject this unless UNAPPLIED_CASH is in the credit families.

---

### T-002: Add `postingGroupId` parameter to `postCashReceiptForObligation`
**File**: `convex/payments/cashLedger/integrations.ts`
**Change**: Add optional `postingGroupId?: string` to the args interface and pass it through to `postCashEntryInternal`.

```typescript
export async function postCashReceiptForObligation(
  ctx: MutationCtx,
  args: {
    obligationId: Id<"obligations">;
    amount: number;
    idempotencyKey: string;
    effectiveDate?: string;
    attemptId?: Id<"collectionAttempts">;
    postingGroupId?: string;  // NEW
    source: CommandSource;
  }
)
```

Pass `postingGroupId: args.postingGroupId` to `postCashEntryInternal`.

---

### T-003: Add `postOverpaymentToUnappliedCash` integration function
**File**: `convex/payments/cashLedger/integrations.ts`
**Change**: New exported function that posts a CASH_RECEIVED entry debiting TRUST_CASH and crediting UNAPPLIED_CASH.

```typescript
export async function postOverpaymentToUnappliedCash(
  ctx: MutationCtx,
  args: {
    attemptId: Id<"collectionAttempts">;
    amount: number;
    mortgageId: Id<"mortgages">;
    borrowerId?: Id<"borrowers">;
    postingGroupId: string;
    source: CommandSource;
  }
)
```

Key details:
- Debit: TRUST_CASH (getOrCreateCashAccount, family TRUST_CASH, scoped to mortgageId)
- Credit: UNAPPLIED_CASH (getOrCreateCashAccount, family UNAPPLIED_CASH, scoped to mortgageId)
- entryType: "CASH_RECEIVED"
- idempotencyKey: `cash-ledger:overpayment:${args.attemptId}`
- Include postingGroupId, mortgageId, attemptId, borrowerId
- reason: "Overpayment: excess beyond obligation balances"
- Use `normalizeSource(args.source)` and `unixMsToBusinessDate(Date.now())`

---

### T-004: Handle missing receivable gracefully in `postCashReceiptForObligation`
**File**: `convex/payments/cashLedger/integrations.ts`
**Change**: Replace `requireCashAccount` with `findCashAccount` for the receivable lookup. If null, log a warning and return null instead of throwing.

```typescript
// Before:
const receivableAccount = await requireCashAccount(ctx.db, {
  family: "BORROWER_RECEIVABLE",
  mortgageId: obligation.mortgageId,
  obligationId: obligation._id,
}, "postCashReceiptForObligation");

// After:
const receivableAccount = await findCashAccount(ctx.db, {
  family: "BORROWER_RECEIVABLE",
  mortgageId: obligation.mortgageId,
  obligationId: obligation._id,
});

if (!receivableAccount) {
  // No matching receivable — skip posting, let ENG-156 reconciliation detect the gap.
  // TODO: ENG-156 — implement SUSPENSE routing for unmatched cash
  console.warn(
    `[postCashReceiptForObligation] No BORROWER_RECEIVABLE account for obligation=${args.obligationId}. Skipping cash receipt. ENG-156 reconciliation will detect this gap.`
  );
  return null;
}
```

Update the return type of `postCashReceiptForObligation` to allow `null`.

---

### T-005: Pass `postingGroupId` through `applyPayment`
**File**: `convex/engine/effects/obligationPayment.ts`
**Change**: Read `postingGroupId` from `args.payload` and pass it to `postCashReceiptForObligation`.

```typescript
const postingGroupId = args.payload?.postingGroupId as string | undefined;

await postCashReceiptForObligation(ctx, {
  obligationId: args.entityId,
  amount,
  idempotencyKey: `cash-ledger:cash-received:${args.journalEntryId}`,
  attemptId,
  postingGroupId,  // NEW
  source: args.source,
});
```

---

### T-006: Generate `postingGroupId` in `emitPaymentReceived`
**File**: `convex/engine/effects/collectionAttempt.ts`
**Change**: Create a postingGroupId before the obligation loop and include it in each PAYMENT_APPLIED transition payload.

```typescript
const postingGroupId = `cash-receipt:${args.entityId}`;

// In the executeTransition call:
const result = await executeTransition(ctx, {
  entityType: "obligation",
  entityId: obligationId,
  eventType: "PAYMENT_APPLIED",
  payload: {
    amount: appliedAmount,
    attemptId: args.entityId,
    currentAmountSettled: obligation.amountSettled,
    totalAmount: obligation.amount,
    postingGroupId,  // NEW
  },
  source: args.source,
});
```

---

### T-007: Add overpayment routing after obligation loop
**File**: `convex/engine/effects/collectionAttempt.ts`
**Change**: After the `for` loop, if `remainingAmount > 0`, call `postOverpaymentToUnappliedCash`.

Need to import `postOverpaymentToUnappliedCash` from integrations.

Need to resolve `mortgageId` and `borrowerId` from the first obligation in planEntry.obligationIds.

```typescript
if (remainingAmount > 0) {
  // Resolve mortgageId from the first obligation for the overpayment entry
  const firstObligation = await ctx.db.get(planEntry.obligationIds[0]);
  if (firstObligation) {
    await postOverpaymentToUnappliedCash(ctx, {
      attemptId: args.entityId,
      amount: remainingAmount,
      mortgageId: firstObligation.mortgageId,
      borrowerId: firstObligation.borrowerId,
      postingGroupId,
      source: args.source,
    });
  } else {
    console.warn(
      `[emitPaymentReceived] Overpayment of ${remainingAmount} cents but no obligation found for mortgageId resolution. attempt=${args.entityId}`
    );
  }
}
```
