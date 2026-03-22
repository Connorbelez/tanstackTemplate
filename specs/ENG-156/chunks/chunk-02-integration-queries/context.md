# Chunk 02 Context: Integration Functions & Query Enrichment

## What This Chunk Does
Build the two new integration functions (`postToSuspense` helper and `postCashReceiptWithSuspenseFallback` wrapper) and enrich the reconciliation query surface with aging info.

## Reference Pattern: selfHealing.ts SUSPENSE Posting (lines 161-201)
This is the established SUSPENSE posting pattern to follow:
```typescript
// 1. Create/find SUSPENSE account
const suspenseAccount = await getOrCreateCashAccount(ctx, {
  family: "SUSPENSE",
  mortgageId: args.mortgageId,
  obligationId: args.obligationId,
});

// 2. Find the credit-side account
const receivableAccount = await requireCashAccount(ctx.db, {
  family: "BORROWER_RECEIVABLE",
  mortgageId: args.mortgageId,
  obligationId: args.obligationId,
}, "dispersalSelfHealing:escalation");

// 3. Post entry
await postCashEntryInternal(ctx, {
  entryType: "SUSPENSE_ESCALATED",
  effectiveDate: unixMsToBusinessDate(Date.now()),
  amount: args.settledAmount,
  debitAccountId: suspenseAccount._id,
  creditAccountId: receivableAccount._id,
  idempotencyKey: `suspense-escalation:${args.obligationId}`,
  mortgageId: args.mortgageId,
  obligationId: args.obligationId,
  source: HEALING_SOURCE,
  reason: "Dispersal retrigger failed after 3 attempts",
  metadata: { attemptCount },
});

// 4. Audit log
await auditLog.log(ctx, {
  action: "dispersal.self_healing_escalated",
  actorId: "system",
  resourceType: "obligation",
  resourceId: args.obligationId,
  severity: "error",
  metadata: { attemptCount, mortgageId: args.mortgageId },
});
```

## Key Differences for SUSPENSE_ROUTED
- Entry type: `SUSPENSE_ROUTED` (not `SUSPENSE_ESCALATED`)
- Credit account: `CASH_CLEARING` (not `BORROWER_RECEIVABLE`) — cash arrived but can't be matched
- Idempotency key prefix: `suspense-routed:` (not `suspense-escalation:`)
- Audit action: `cashLedger.suspense_routed`
- Metadata includes: reason, originalObligationId, originalAmount, attemptId

## Current integrations.ts Structure
File has these exports:
- `postObligationAccrued` (lines 56-97)
- `postCashReceiptForObligation` (lines 99-147)
- `postSettlementAllocation` (lines 149-220)

Private helpers:
- `normalizeSource` (lines 24-50) — normalizes CommandSource
- `unixMsToBusinessDate` (lines 52-54) — converts ms to YYYY-MM-DD

New functions should follow the same patterns: use `normalizeSource`, use `getOrCreateCashAccount` + `postCashEntryInternal`, same import style.

## Import for auditLog
From selfHealing.ts: `import { auditLog } from "../auditLog";`
In integrations.ts the path will be: `import { auditLog } from "../../auditLog";`

## postCashReceiptWithSuspenseFallback Design
```
Input: {
  obligationId?: Id<"obligations">,    // may be undefined for truly unmatched cash
  mortgageId?: Id<"mortgages">,         // may be undefined
  amount: number,                       // cents, safe integer
  idempotencyKey: string,               // from upstream caller
  effectiveDate?: string,               // YYYY-MM-DD, defaults to today
  attemptId?: Id<"collectionAttempts">, // for traceability
  source: CommandSource,                // from upstream
  mismatchReason?: string,              // diagnostic: "obligation_not_found", "invalid_reference", etc.
}

Logic:
1. If obligationId provided → look up obligation
2. If obligation found → delegate to postCashReceiptForObligation (happy path)
3. If obligation NOT found or obligationId not provided → postToSuspense fallback
```

## getSuspenseItems Current Shape (lines 132-149)
```typescript
export const getSuspenseItems = cashLedgerQuery
  .handler(async (ctx) => {
    const accounts = await ctx.db
      .query("cash_ledger_accounts")
      .withIndex("by_family", (q) => q.eq("family", "SUSPENSE"))
      .collect();

    return accounts
      .map((account) => ({
        accountId: account._id,
        mortgageId: account.mortgageId,
        obligationId: account.obligationId,
        balance: getCashAccountBalance(account),
        metadata: account.metadata,
      }))
      .filter((entry) => entry.balance > 0n);
  })
  .public();
```

Enrich to add:
- `createdAt: account._creationTime` — when the SUSPENSE account was created (proxy for when cash was routed)
- `ageMs: Date.now() - account._creationTime` — age in milliseconds for escalation workflow

## Constraints
- Never silently drop cash. If obligation can't be resolved, MUST route to SUSPENSE.
- Diagnostic metadata is mandatory on every SUSPENSE entry.
- This is read-only SUSPENSE routing — resolution (moving out) is ENG-169 / Phase 4.
- Follow the self-healing pattern: getOrCreateCashAccount + postCashEntryInternal + auditLog.log
