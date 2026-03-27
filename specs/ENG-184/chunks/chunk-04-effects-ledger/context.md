# Chunk 4 Context: Effects & Ledger Bridge

## Goal
Implement the four transfer effects (GT effect registry entries) and the two new cash ledger integration functions.

---

## T-013: Create `convex/engine/effects/transfer.ts`

Create four internal mutations following the existing pattern from `convex/engine/effects/collectionAttempt.ts`.

**Pattern to follow — existing collectionAttempt effects use:**
```typescript
import { internalMutation } from "../../_generated/server";
// ...
export const emitPaymentReceived = internalMutation({
  args: collectionAttemptEffectValidator,
  handler: async (ctx, args) => { /* ... */ },
});
```

**Transfer effect validator args** (similar to collection attempt):
```typescript
const transferEffectValidator = {
  entityId: v.id("transferRequests"),
  entityType: v.literal("transfer"),
  eventType: v.string(),
  payload: v.optional(v.any()),
  source: sourceValidator,
};
```

### Effect 1: `recordTransferProviderRef`
- Load the transfer record by `entityId`
- Patch the `providerRef` field from `payload.providerRef`
- Audit: log to audit journal

### Effect 2: `publishTransferConfirmed`
- Load the transfer record
- **Decision D4 conditional**: Check `collectionAttemptId`
  - If `collectionAttemptId` is set → **skip cash posting** (bridged transfer, audit-trail only). Log: "Bridged transfer confirmed — cash posted via collection attempt path"
  - If `collectionAttemptId` is NOT set → **actively post** via integration functions
- For native inbound: call `postCashReceiptForTransfer(ctx, { transferRequestId, source })`
- For native outbound: call `postLenderPayoutForTransfer(ctx, { transferRequestId, source })`
- Patch `settledAt` on the transfer record
- Determine direction from the transfer record to choose the correct posting function

### Effect 3: `publishTransferFailed`
- Load the transfer record
- Patch `failedAt`, `failureReason`, `failureCode` from payload
- Log admin notification (console.warn for Phase 1; real notification in Phase 2)

### Effect 4: `publishTransferReversed`
- Load the transfer record
- Patch `reversedAt`, `reversalRef` from payload
- Call existing `postTransferReversal()` from `convex/payments/cashLedger/integrations.ts`
  - This function already exists and accepts `transferRequestId`

**Existing postTransferReversal signature:**
```typescript
export async function postTransferReversal(
  ctx: MutationCtx,
  args: {
    transferRequestId: Id<"transferRequests">;
    originalEntryId: Id<"cash_ledger_journal_entries">;
    amount: number;
    effectiveDate: string;
    source: CommandSource;
    reason: string;
  }
): Promise<{ entry: Doc<"cash_ledger_journal_entries"> }>
```

---

## T-014: Register Transfer Effects in Effect Registry

**File:** `convex/engine/effects/registry.ts`

**Current collection attempt effects (for reference):**
```typescript
// Collection Attempt effects (ENG-64)
emitPaymentReceived: internal.engine.effects.collectionAttempt.emitPaymentReceived,
emitCollectionFailed: internal.engine.effects.collectionAttempt.emitCollectionFailed,
recordProviderRef: internal.engine.effects.collectionAttempt.recordProviderRef,
notifyAdmin: internal.engine.effects.collectionAttempt.notifyAdmin,
emitPaymentReversed: internal.engine.effects.collectionAttempt.emitPaymentReversed,
```

**IMPORTANT**: The action names in the transfer machine (`recordTransferProviderRef`, `publishTransferConfirmed`, `publishTransferFailed`, `publishTransferReversed`) are DIFFERENT from the collection attempt names. The effect registry maps action names → function references. Add:

```typescript
// Transfer effects (ENG-184)
recordTransferProviderRef: internal.engine.effects.transfer.recordTransferProviderRef,
publishTransferConfirmed: internal.engine.effects.transfer.publishTransferConfirmed,
publishTransferFailed: internal.engine.effects.transfer.publishTransferFailed,
publishTransferReversed: internal.engine.effects.transfer.publishTransferReversed,
```

---

## T-015: Add `postCashReceiptForTransfer()`

**File:** `convex/payments/cashLedger/integrations.ts`

This function is called by `publishTransferConfirmed` for native inbound transfers.

**Contract:**
```typescript
export async function postCashReceiptForTransfer(
  ctx: MutationCtx,
  args: {
    transferRequestId: Id<"transferRequests">;
    source: CommandSource;
  }
): Promise<Doc<"cash_ledger_journal_entries">>
```

**Logic:**
1. Load the transfer record by ID
2. Determine the credit account family from transfer type:
   - `borrower_interest_collection`, `borrower_principal_collection`, `borrower_late_fee_collection`, `borrower_arrears_cure` → credit `BORROWER_RECEIVABLE`
   - `locking_fee_collection`, `commitment_deposit_collection` → credit `UNAPPLIED_CASH`
   - `deal_principal_transfer` → credit `CASH_CLEARING`
3. Debit account: always `TRUST_CASH`
4. Build idempotency key: `cash-ledger:cash-received:transfer:{transferRequestId}`
5. Call `postCashEntryInternal()` (the existing 9-step validated pipeline)

**Transfer Type → Cash Entry Type mapping (from spec):**

| Transfer Type | Cash Entry Type | Debit | Credit |
|---|---|---|---|
| `borrower_interest_collection` | `CASH_RECEIVED` | `TRUST_CASH` | `BORROWER_RECEIVABLE` |
| `borrower_principal_collection` | `CASH_RECEIVED` | `TRUST_CASH` | `BORROWER_RECEIVABLE` |
| `borrower_late_fee_collection` | `CASH_RECEIVED` | `TRUST_CASH` | `BORROWER_RECEIVABLE` |
| `borrower_arrears_cure` | `CASH_RECEIVED` | `TRUST_CASH` | `BORROWER_RECEIVABLE` |
| `locking_fee_collection` | `CASH_RECEIVED` | `TRUST_CASH` | `UNAPPLIED_CASH` |
| `commitment_deposit_collection` | `CASH_RECEIVED` | `TRUST_CASH` | `UNAPPLIED_CASH` |
| `deal_principal_transfer` | `CASH_RECEIVED` | `TRUST_CASH` | `CASH_CLEARING` |

---

## T-016: Add `postLenderPayoutForTransfer()`

**File:** `convex/payments/cashLedger/integrations.ts`

For native outbound transfers.

**Contract:**
```typescript
export async function postLenderPayoutForTransfer(
  ctx: MutationCtx,
  args: {
    transferRequestId: Id<"transferRequests">;
    source: CommandSource;
  }
): Promise<Doc<"cash_ledger_journal_entries">>
```

**Logic:**
1. Load the transfer record by ID
2. Entry type: `LENDER_PAYOUT_SENT`
3. Debit: `LENDER_PAYABLE`, Credit: `TRUST_CASH`
4. Build idempotency key: `cash-ledger:lender-payout-sent:transfer:{transferRequestId}`
5. Call `postCashEntryInternal()`

| Transfer Type | Cash Entry Type | Debit | Credit |
|---|---|---|---|
| `lender_dispersal_payout` | `LENDER_PAYOUT_SENT` | `LENDER_PAYABLE` | `TRUST_CASH` |
| `lender_principal_return` | `LENDER_PAYOUT_SENT` | `LENDER_PAYABLE` | `TRUST_CASH` |
| `deal_seller_payout` | `LENDER_PAYOUT_SENT` | `LENDER_PAYABLE` | `TRUST_CASH` |

---

## Important: Read the Cash Ledger Integration File FIRST

Before writing T-015/T-016, READ `convex/payments/cashLedger/integrations.ts` to understand:
- The `postCashEntryInternal()` 9-step pipeline signature
- How existing functions like `postCashReceiptForObligation()` build their arguments
- The entry type validators and account family enum
- The idempotency key convention
- The dimension fields (mortgageId, obligationId, etc.)

Follow the EXACT patterns used by existing integration functions. Do not invent a new calling convention.
