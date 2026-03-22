# Chunk 01 Context: Implementation Changes

## Linear Issue: ENG-159
**Title**: Phase 2: Journal cash receipts from collection confirmations
**Priority**: Urgent | **Status**: Todo
**Project**: Cash & Obligations Ledger

## What Already Exists
The core flow is already wired end-to-end:
```
FUNDS_SETTLED → collectionAttempt.confirmed
  → emitPaymentReceived (effect)
    → for each obligation: executeTransition(PAYMENT_APPLIED)
      → applyPayment (effect)
        → postCashReceiptForObligation ✅
```

### Existing Functions
1. `postCashReceiptForObligation` (`convex/payments/cashLedger/integrations.ts:99-147`)
   - Resolves TRUST_CASH and BORROWER_RECEIVABLE accounts
   - Posts balanced CASH_RECEIVED entry via `postCashEntryInternal`
   - Uses TRUST_CASH as canonical cash account (per OQ-3)

2. `applyPayment` (`convex/engine/effects/obligationPayment.ts:19-78`)
   - Calls `postCashReceiptForObligation` on every PAYMENT_APPLIED event
   - Passes attemptId for traceability
   - Idempotency key: `cash-ledger:cash-received:${journalEntryId}`

3. `emitPaymentReceived` (`convex/engine/effects/collectionAttempt.ts:52-111`)
   - Distributes payment across obligations from plan entry
   - Calculates per-obligation applied amount: `min(remainingAmount, outstandingAmount)`
   - Fires PAYMENT_APPLIED transitions per obligation

## What's Missing (This Chunk)

| Gap | Description | Severity |
|-----|-------------|----------|
| Overpayment routing | After all obligations satisfied, excess `remainingAmount` falls through silently. Must route to UNAPPLIED_CASH. | P0 |
| No-match SUSPENSE routing | If BORROWER_RECEIVABLE doesn't exist, `requireCashAccount` throws instead of handling gracefully | P0 |
| Already-settled routing | Payment to settled obligation (outstandingAmount=0) → remainder stays in remainingAmount → handled by overpayment routing after loop | P1 |
| postingGroupId missing | Multi-obligation payments don't share a postingGroupId for correlation | P1 |
| Family map update | UNAPPLIED_CASH needs to be in CASH_RECEIVED credit families for overpayment entries | P1 |

## Key Architecture Decisions

### OQ-3: TRUST_CASH as canonical pre-VoPay cash account
Pre-VoPay, all collection/payout is manual admin confirmation — no clearing period exists. `CASH_RECEIVED` entries debit `TRUST_CASH`. `CASH_CLEARING` is defined but has zero balance in Phase 1.

### Idempotency Key Format
The code uses `cash-ledger:cash-received:${journalEntryId}` which is per-obligation (one entry per obligation, not per attempt). This is correct for multi-obligation payments. The overpayment entry uses `cash-ledger:overpayment:${attemptId}`.

### SUSPENSE Routing Decision
The implementation plan recommends the **simpler approach**: log a warning and skip posting when no receivable exists. Let ENG-156's reconciliation cron detect the gap. This avoids modifying family maps in ways that could confuse later SUSPENSE_ESCALATED logic.

## CASH_ENTRY_TYPE_FAMILY_MAP (Current)
```typescript
CASH_RECEIVED: {
  debit: ["TRUST_CASH", "CASH_CLEARING", "UNAPPLIED_CASH"],
  credit: ["BORROWER_RECEIVABLE"],  // NEEDS: + "UNAPPLIED_CASH"
},
SUSPENSE_ESCALATED: {
  debit: ["SUSPENSE"],
  credit: ["BORROWER_RECEIVABLE"],
},
```

## PostCashEntryInput Interface
```typescript
export interface PostCashEntryInput {
  amount: number;
  attemptId?: Id<"collectionAttempts">;
  borrowerId?: Id<"borrowers">;
  causedBy?: Id<"cash_ledger_journal_entries">;
  creditAccountId: Id<"cash_ledger_accounts">;
  debitAccountId: Id<"cash_ledger_accounts">;
  dispersalEntryId?: Id<"dispersalEntries">;
  effectiveDate: string;
  entryType: CashEntryType;
  idempotencyKey: string;
  lenderId?: Id<"lenders">;
  metadata?: Record<string, unknown>;
  mortgageId?: Id<"mortgages">;
  obligationId?: Id<"obligations">;
  postingGroupId?: string;
  reason?: string;
  source: CommandSource;
}
```

## Account Functions
- `findCashAccount(db, spec)` → returns account or null
- `requireCashAccount(db, spec, label)` → throws if not found
- `getOrCreateCashAccount(ctx, spec)` → creates if not found

## normalizeSource helper
Already exists in `integrations.ts` — converts legacy source formats to `CommandSource`.

## unixMsToBusinessDate helper
Already exists in `integrations.ts` — converts Unix ms to YYYY-MM-DD string.

## File Map
| File | Action | Description |
|------|--------|-------------|
| `convex/payments/cashLedger/types.ts` | Modify | Add UNAPPLIED_CASH to CASH_RECEIVED credit families |
| `convex/payments/cashLedger/integrations.ts` | Modify | Add postingGroupId to postCashReceiptForObligation, add postOverpaymentToUnappliedCash, handle missing receivable |
| `convex/engine/effects/obligationPayment.ts` | Modify | Pass postingGroupId through to cash receipt posting |
| `convex/engine/effects/collectionAttempt.ts` | Modify | Generate postingGroupId, add overpayment routing after loop |

## Constraints
- All monetary amounts must be safe integers in cents (REQ-248)
- Entries are append-only — no mutations or deletions (REQ-242)
- Idempotent on attemptId/journalEntryId (REQ-246)
- TRUST_CASH is the canonical cash account pre-VoPay (OQ-3)
- Use `CommandSource` (not legacy source format) for all new code
- Follow existing patterns in `integrations.ts` for new integration functions
