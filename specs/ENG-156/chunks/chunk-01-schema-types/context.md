# Chunk 01 Context: Schema & Types

## What This Chunk Does
Register the new `SUSPENSE_ROUTED` entry type across all 4 layers that define entry types: the TypeScript types, the Convex validators, the Convex schema, and the posting pipeline's balance check exclusion.

## Design Decision: SUSPENSE_ROUTED vs SUSPENSE_ESCALATED
From the implementation plan drift report (DRIFT-1):
- `SUSPENSE_ESCALATED` = dispersal failure escalation (existing). Family map: `debit: ["SUSPENSE"], credit: ["BORROWER_RECEIVABLE"]`
- `SUSPENSE_ROUTED` = unmatched cash routing (new). Family map: `debit: ["SUSPENSE"], credit: ["CASH_CLEARING", "TRUST_CASH", "UNAPPLIED_CASH"]`

The credit families differ because:
- SUSPENSE_ESCALATED moves money FROM receivable TO suspense (dispersal failed, receivable is still outstanding)
- SUSPENSE_ROUTED moves money FROM cash clearing/trust TO suspense (cash arrived but can't be matched to an obligation)

## Current State of types.ts
```typescript
// Line 15-27: CASH_ENTRY_TYPES array
export const CASH_ENTRY_TYPES = [
  "OBLIGATION_ACCRUED",
  "CASH_RECEIVED",
  "CASH_APPLIED",
  "LENDER_PAYABLE_CREATED",
  "SERVICING_FEE_RECOGNIZED",
  "LENDER_PAYOUT_SENT",
  "OBLIGATION_WAIVED",
  "OBLIGATION_WRITTEN_OFF",
  "REVERSAL",
  "CORRECTION",
  "SUSPENSE_ESCALATED",
] as const;

// Line 91-94: Last entry in CASH_ENTRY_TYPE_FAMILY_MAP
SUSPENSE_ESCALATED: {
  debit: ["SUSPENSE"],
  credit: ["BORROWER_RECEIVABLE"],
},
```

## Current State of validators.ts
```typescript
// Line 4-16: cashEntryTypeValidator
export const cashEntryTypeValidator = v.union(
  v.literal("OBLIGATION_ACCRUED"),
  ...
  v.literal("SUSPENSE_ESCALATED")
);
```

## Current State of schema.ts (line ~1063-1073)
```typescript
entryType: v.union(
  v.literal("OBLIGATION_ACCRUED"),
  ...
  v.literal("SUSPENSE_ESCALATED")
),
```

## Current State of postEntry.ts balanceCheck (lines 95-106)
```typescript
function balanceCheck(
  args: PostCashEntryInput,
  debitAccount: Doc<"cash_ledger_accounts">,
  creditAccount: Doc<"cash_ledger_accounts">
) {
  if (
    args.entryType === "REVERSAL" ||
    args.entryType === "CORRECTION" ||
    args.entryType === "SUSPENSE_ESCALATED"
  ) {
    return;
  }
  // ... balance checks follow
}
```

## Why SUSPENSE_ROUTED Skips Balance Checks
SUSPENSE routing is an exception-handling mechanism. The SUSPENSE account may not have prior balance, and CASH_CLEARING may be freshly created. Enforcing balance checks would prevent the safety net from working. Same rationale as SUSPENSE_ESCALATED, REVERSAL, and CORRECTION.

## File Modification Order
1. types.ts first (defines the TypeScript type)
2. validators.ts (Convex runtime validator must match)
3. schema.ts (Convex schema must match)
4. postEntry.ts (pipeline behavior for new type)

This order ensures codegen picks up all changes atomically.
