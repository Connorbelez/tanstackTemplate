# Chunk Context: wiring-and-query

Source: Linear ENG-180, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

### Wiring into Reversal Flow

The corrective obligation is scheduled after the reversal cascade completes. The wiring point is `emitPaymentReversed` in `convex/engine/effects/collectionAttempt.ts`.

From the implementation plan:
```typescript
// At end of processReversalCascade handler:
const { reversalEntries, postingGroupId, clawbackRequired } = cascadeResult;

// Schedule corrective obligation creation
await ctx.scheduler.runAfter(
  0,
  internal.payments.obligations.createCorrectiveObligation.createCorrectiveObligation,
  {
    originalObligationId: args.obligationId,
    reversedAmount: cascadeResult.reversalEntries.reduce((sum, e) => sum + e.amount, 0), // derive from cascade
    reason: args.reason,
    postingGroupId: cascadeResult.postingGroupId,
    source: {
      actorType: "system",
      actorId: `webhook:reversal`,
      channel: "webhook",
    },
  }
);
```

### Query for Corrective Obligations

The implementation plan suggests adding a `by_source_obligation` index and query functions:

```typescript
export const getCorrectiveObligations = internalQuery({
  args: {
    originalObligationId: v.id("obligations"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("obligations")
      .withIndex("by_source_obligation", (q) =>
        q.eq("sourceObligationId", args.originalObligationId)
      )
      .filter((q) => q.neq(q.field("type"), "late_fee"))
      .collect();
  },
});
```

## Current emitPaymentReversed Implementation

File: `convex/engine/effects/collectionAttempt.ts` (lines 216-270)

```typescript
export const emitPaymentReversed = internalMutation({
    args: collectionAttemptEffectValidator,
    handler: async (ctx, args) => {
        const { planEntry } = await loadAttemptAndPlanEntry(
            ctx,
            args,
            "emitPaymentReversed"
        );

        let reason: string;
        if (typeof args.payload?.reason === "string") {
            reason = args.payload.reason;
        } else {
            reason = "payment_reversed";
            console.warn(
                `[emitPaymentReversed] No valid reason in payload for attempt=${args.entityId}. Defaulting to "${reason}".`
            );
        }

        const effectiveDate =
            typeof args.payload?.effectiveDate === "string"
                ? args.payload.effectiveDate
                : new Date().toISOString().slice(0, 10);

        for (const obligationId of planEntry.obligationIds) {
            const obligation = await ctx.db.get(obligationId);
            if (!obligation) {
                throw new Error(
                    `[emitPaymentReversed] Obligation not found: ${obligationId} ` +
                        `(attempt=${args.entityId}). Cannot complete reversal — ` +
                        "the cash ledger would be left in an inconsistent state."
                );
            }

            console.info(
                `[emitPaymentReversed] Starting reversal cascade for attempt=${args.entityId}, obligation=${obligationId}`
            );

            await postPaymentReversalCascade(ctx, {
                attemptId: args.entityId,
                obligationId,
                mortgageId: obligation.mortgageId,
                effectiveDate,
                source: args.source,
                reason,
            });

            console.info(
                `[emitPaymentReversed] Reversal cascade complete for attempt=${args.entityId}, obligation=${obligationId}`
            );
        }
    },
});
```

**What to add**: After `postPaymentReversalCascade` returns, schedule `createCorrectiveObligation` via `ctx.scheduler.runAfter(0, ...)`. The cascade returns `{ reversalEntries, postingGroupId, clawbackRequired }`. Derive `reversedAmount` from the cascade result (e.g., summing `reversalEntries` amounts) rather than hard-coding `obligation.amount`, so that partial reversals only recreate the reversed cash amount. Only schedule if `obligation.status === "settled"`.

### Important: Import the internal function reference

You need to add an import for the new createCorrectiveObligation function reference:
```typescript
import { internal } from "../../_generated/api";
```
This import already exists at line 2. The function reference will be:
```typescript
internal.payments.obligations.createCorrectiveObligation.createCorrectiveObligation
```

## postPaymentReversalCascade Return Type

From `convex/payments/cashLedger/integrations.ts:1381`:

```typescript
): Promise<{
    reversalEntries: Doc<"cash_ledger_journal_entries">[];
    postingGroupId: string;
    clawbackRequired: boolean;
}>
```

## Current Obligation Queries File

File: `convex/payments/obligations/queries.ts`

Current queries:
- `getObligationsByMortgage` — by mortgageId, optional status filter
- `getUpcomingDue` — upcoming obligations with dueDate <= asOf
- `getDuePastGrace` — due obligations with gracePeriodEnd <= asOf
- `getOverdue` — overdue obligations by mortgageId
- `getLateFeeForObligation` — late_fee by sourceObligationId using `by_type_source_and_fee_code` index

The new queries should follow the same patterns:
- Use `internalQuery` (not exported query)
- Use indexes where available
- Standard Convex query patterns with `.withIndex()` and `.filter()`

## Integration Points

### From Chunk 01

- `createCorrectiveObligation` is created in `convex/payments/obligations/createCorrectiveObligation.ts`
- New `by_source_obligation` index is added to schema
- Both must be deployed before this chunk's wiring works

### Downstream Consumers

- `getCorrectiveObligations` will be used by:
  - Reconciliation queries (detecting settled obligations with correctives)
  - Admin views (showing original → corrective links)
  - Future collection engine (to know which obligations are corrective)

## Constraints & Rules

- **Scheduler for corrective creation**: Use `ctx.scheduler.runAfter(0, ...)` not direct function call, because the corrective obligation is a new entity creation (not part of the reversal transaction). This matches the project pattern where cross-entity side effects use the scheduler.
- **Only for settled obligations**: The guard `obligation.status === "settled"` prevents creating correctives for non-settled obligations that might appear in multi-obligation plan entries.
- **Source forwarding**: Pass `args.source` from the emitPaymentReversed args through to the corrective obligation creation, preserving the audit trail back to the webhook/actor that triggered the reversal.
- **Amount**: Derive `reversedAmount` from the cascade result (sum of `reversalEntries` amounts) so that partial reversals produce a corrective obligation for only the reversed cash, not the full obligation amount.

## File Structure

- Modified: `convex/engine/effects/collectionAttempt.ts` (add corrective scheduling in emitPaymentReversed)
- Modified: `convex/payments/obligations/queries.ts` (add two new internalQuery exports)
