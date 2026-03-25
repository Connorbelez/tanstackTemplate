# Chunk 3 Context: Self-Healing Cron & Query Endpoints

## Goal
Build the self-healing cron that detects orphaned confirmed transfers, retriggers the journal entry creation effect, escalates to SUSPENSE after 3 failures, and expose public query endpoints for all 4 transfer checks.

## Pattern: Dispersal Self-Healing (exact template to follow)

The existing `convex/dispersal/selfHealing.ts` is the canonical pattern. The transfer reconciliation cron mirrors it exactly:

### Architecture (3 Convex function types):
1. **internalQuery** — finds candidates (pure read, no side effects)
2. **internalMutation** — retriggers or escalates per candidate (writes)
3. **internalAction** — orchestrates: query → loop mutations → logging

### Why actions orchestrate:
Actions can call `ctx.runQuery()` and `ctx.runMutation()` across transaction boundaries. The cron entry point must be an action because:
- Queries can't schedule functions
- Mutations can't call queries in separate transactions
- Actions bridge both while maintaining transactional safety per step

### Typed function references pattern:
Convex actions need typed references to call queries/mutations. Use `makeFunctionReference`:

```typescript
import type { FunctionReference, FunctionType } from "convex/server";
import { makeFunctionReference } from "convex/server";

function makeInternalRef<
    Type extends FunctionType,
    Args extends Record<string, unknown>,
    ReturnType,
>(name: string) {
    return makeFunctionReference<Type, Args, ReturnType>(
        name
    ) as unknown as FunctionReference<Type, "internal", Args, ReturnType>;
}
```

## T-011: findOrphanedConfirmedTransfersForHealing

**File:** `convex/payments/cashLedger/transferReconciliationCron.ts` (new file)

```typescript
export const findOrphanedConfirmedTransfersForHealing = internalQuery({
    args: {},
    handler: async (ctx): Promise<TransferHealingCandidate[]> => {
        const now = Date.now();
        const threshold = now - ORPHAN_THRESHOLD_MS; // 5 min

        const confirmed = await ctx.db
            .query("transferRequests")
            .withIndex("by_status", (q) => q.eq("status", "confirmed"))
            .collect();

        const candidates: TransferHealingCandidate[] = [];

        for (const transfer of confirmed) {
            // Skip recent (in-flight processing)
            if (transfer.confirmedAt && transfer.confirmedAt > threshold) continue;
            if (!transfer.amount || !transfer.direction) continue;

            // Check if journal entry exists
            const entries = await ctx.db
                .query("cash_ledger_journal_entries")
                .withIndex("by_transfer_request", (q) =>
                    q.eq("transferRequestId", transfer._id)
                )
                .collect();

            const expectedType = transfer.direction === "inbound"
                ? "CASH_RECEIVED"
                : "LENDER_PAYOUT_SENT";

            const hasMatch = entries.some((e) => e.entryType === expectedType);
            if (hasMatch) continue;

            // Check if already escalated
            const healingAttempt = await ctx.db
                .query("transferHealingAttempts")
                .withIndex("by_transfer_request", (q) =>
                    q.eq("transferRequestId", transfer._id)
                )
                .first();

            if (healingAttempt?.status === "escalated") continue;

            candidates.push({
                transferRequestId: transfer._id,
                direction: transfer.direction,
                amount: transfer.amount,
                mortgageId: transfer.mortgageId ?? undefined,
                obligationId: transfer.obligationId ?? undefined,
                confirmedAt: transfer.confirmedAt ?? transfer._creationTime,
            });
        }

        return candidates;
    },
});
```

## T-012: retriggerTransferConfirmation

**File:** `convex/payments/cashLedger/transferReconciliationCron.ts`

This mutation handles 3 code paths:
1. **Skip** — already escalated
2. **Retry** — attemptCount <= MAX_TRANSFER_HEALING_ATTEMPTS (3), re-schedule the effect
3. **Escalate** — attemptCount > 3, post to SUSPENSE

Follow `dispersal/selfHealing.ts:retriggerDispersal` (lines 116-237) exactly.

### Retry path:
The issue says to "re-schedule the transfer confirmation effect via `ctx.scheduler.runAfter(0, ...)`".

**IMPORTANT:** The `publishTransferConfirmed` effect doesn't exist yet in the codebase (noted in Drift Report). For now, the retry should schedule a generic re-processing function. Since the actual effect function doesn't exist, create a placeholder internal mutation that the cron can schedule:

```typescript
// Placeholder for the transfer confirmation re-processing
// Will be replaced by the actual publishTransferConfirmed effect
// when the Unified Payment Rails are implemented
export const retryTransferConfirmationEffect = internalMutation({
    args: { transferRequestId: v.id("transferRequests") },
    handler: async (ctx, args) => {
        // For now, this is a no-op placeholder.
        // When Payment Rails land, this will call the actual
        // publishTransferConfirmed bridge function.
        console.warn(
            `[TRANSFER-HEALING] Retry scheduled for ${args.transferRequestId} — ` +
            `publishTransferConfirmed not yet implemented`
        );
    },
});
```

### Escalation path (SUSPENSE posting):
Follow the dispersal self-healing's escalation exactly:

```typescript
// Get or create SUSPENSE account for this transfer's mortgage
const suspenseAccount = await getOrCreateCashAccount(ctx, {
    family: "SUSPENSE",
    mortgageId: args.mortgageId,
});

// The credit account depends on the transfer direction:
// - Inbound: credit BORROWER_RECEIVABLE (the expected receivable that was never journaled)
// - Outbound: credit LENDER_PAYABLE (the expected payable)
// If no receivable/payable account exists, create one for the SUSPENSE escalation

await postCashEntryInternal(ctx, {
    entryType: "SUSPENSE_ESCALATED",
    effectiveDate: unixMsToBusinessDate(Date.now()),
    amount: args.amount,
    debitAccountId: suspenseAccount._id,
    creditAccountId: creditAccount._id, // BORROWER_RECEIVABLE or LENDER_PAYABLE
    idempotencyKey: `suspense-escalation:transfer:${args.transferRequestId}`,
    mortgageId: args.mortgageId,
    transferRequestId: args.transferRequestId,
    source: HEALING_SOURCE,
    reason: "Transfer confirmation retrigger failed after 3 attempts",
    metadata: { attemptCount },
});
```

Also log via `auditLog.log()`:
```typescript
await auditLog.log(ctx, {
    action: "transfer.reconciliation_escalated",
    actorId: "system",
    resourceType: "transferRequest",
    resourceId: args.transferRequestId,
    severity: "error",
    metadata: {
        attemptCount,
        mortgageId: args.mortgageId,
        direction: args.direction,
    },
});
```

## T-013: transferReconciliationCron

**File:** `convex/payments/cashLedger/transferReconciliationCron.ts`

Follow `dispersal/selfHealing.ts:dispersalSelfHealingCron` (lines 265-327):

```typescript
export const transferReconciliationCron = internalAction({
    handler: async (ctx): Promise<TransferHealingResult> => {
        const candidates = await ctx.runQuery(findOrphanedRef, {});

        if (candidates.length === 0) {
            console.info("[TRANSFER-HEALING] No orphaned confirmed transfers found.");
            return { checkedAt: Date.now(), candidatesFound: 0, retriggered: 0, escalated: 0 };
        }

        console.warn(
            `[TRANSFER-HEALING] Found ${candidates.length} confirmed transfers without journal entries`
        );

        let retriggered = 0;
        let escalated = 0;

        for (const candidate of candidates) {
            const result = await ctx.runMutation(retriggerRef, {
                transferRequestId: candidate.transferRequestId,
                direction: candidate.direction,
                amount: candidate.amount,
                mortgageId: candidate.mortgageId,
                obligationId: candidate.obligationId,
            });

            if (result.action === "retriggered") retriggered++;
            if (result.action === "escalated") escalated++;
        }

        if (escalated > 0) {
            console.error(
                `[TRANSFER-HEALING P0] ${escalated} transfers escalated to SUSPENSE`
            );
        }

        console.info(
            `[TRANSFER-HEALING] Complete: ${candidates.length} found, ` +
            `${retriggered} retriggered, ${escalated} escalated`
        );

        return { checkedAt: Date.now(), candidatesFound: candidates.length, retriggered, escalated };
    },
});
```

## T-014: Wire into crons.ts

**File:** `convex/crons.ts`

Add after the existing `dispersal self-healing` cron (line ~34):

```typescript
// Transfer reconciliation: detect confirmed transfers without journal entries.
// Runs every 15 minutes — highest-risk gap because publishTransferConfirmed
// runs async via scheduler.runAfter(0) and can fail silently.
// See ENG-165 and Tech Design §10.
crons.interval(
    "transfer reconciliation",
    { minutes: 15 },
    internal.payments.cashLedger.transferReconciliationCron.transferReconciliationCron
);
```

## T-015: Add Public Query Endpoints

**File:** `convex/payments/cashLedger/reconciliationQueries.ts`

Add 4 new endpoints following the exact same pattern as existing queries (cashLedgerQuery with optional filters):

```typescript
// ── 12. Orphaned Confirmed Transfers ──────────────────────────
export const reconciliationOrphanedConfirmedTransfers = cashLedgerQuery
    .input({ mortgageId: v.optional(v.id("mortgages")) })
    .handler(async (ctx, args) => {
        const result = await checkOrphanedConfirmedTransfers(ctx);
        if (!args.mortgageId) return result;
        const items = result.items.filter((i) => i.mortgageId === args.mortgageId);
        return recomputeResult(result, items, (i) => i.amount);
    })
    .public();

// ── 13. Orphaned Reversed Transfers ──────────────────────────
// Same pattern for reversed

// ── 14. Stale Outbound Transfers ──────────────────────────────
// Same pattern, no mortgage filter (use transferRequestId filtering if needed)

// ── 15. Transfer Amount Mismatches ────────────────────────────
// Same pattern
```

**Import the check functions from transferReconciliation.ts.**

## Existing Files to Read Before Implementing
- `convex/dispersal/selfHealing.ts` — **primary template** for the cron architecture
- `convex/dispersal/selfHealingTypes.ts` — type definitions pattern
- `convex/payments/cashLedger/reconciliationCron.ts` — existing cash ledger cron pattern
- `convex/payments/cashLedger/reconciliationQueries.ts` — public query endpoint pattern
- `convex/payments/cashLedger/integrations.ts` — postToSuspense function (lines 634-665)
- `convex/payments/cashLedger/postEntry.ts` — postCashEntryInternal
- `convex/payments/cashLedger/accounts.ts` — getOrCreateCashAccount, requireCashAccount
- `convex/fluent.ts` or wherever `cashLedgerQuery` is defined

## Constants
```typescript
const ORPHAN_THRESHOLD_MS = 5 * 60_000; // 5 minutes
const HEALING_SOURCE: CommandSource = { actorType: "system", channel: "scheduler" };
```

## Quality Gate
After all tasks: `bun check`, `bun typecheck`, `bunx convex codegen`
