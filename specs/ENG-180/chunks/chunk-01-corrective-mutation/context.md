# Chunk Context: corrective-mutation

Source: Linear ENG-180, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

### What We're Building

After a payment reversal, the obligation remains `settled` in the domain model (by design — the XState final state can't re-open). A **new corrective obligation** must be created, linked to the original via `sourceObligationId`, to re-establish the receivable in the domain layer.

The cash ledger handles the money-side reversal (REVERSAL entries restore the receivable balance). But downstream systems (collection engine, admin views, obligation crons) operate on obligation records, not journal entries. Without a corrective obligation, the borrower appears fully paid in every system except the journal.

### Architecture Decision (from Tech Design §5.2)

Rather than modifying the obligation state machine (which would break the GT engine's invariants around final states), reversals are handled entirely through the cash ledger:
1. The obligation remains in `settled` state in the domain model
2. The cash ledger posts `REVERSAL` entries that restore the receivable balance
3. Admin/system creates a **new corrective obligation** linked to the original via `sourceObligationId`

This is an **internal mutation** called at the end of the reversal flow, not a GT effect, because it creates a new entity rather than transitioning an existing one.

### Code Sketch from Implementation Plan

```typescript
import { ConvexError, v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { postObligationAccrued } from "../../payments/cashLedger/integrations";
import type { CommandSource } from "../../engine/types";

export const createCorrectiveObligation = internalMutation({
  args: {
    originalObligationId: v.id("obligations"),
    reversedAmount: v.number(),
    reason: v.string(),
    postingGroupId: v.string(),
    source: v.object({
      actorType: v.optional(v.string()),
      actorId: v.optional(v.string()),
      channel: v.optional(v.string()),
      ip: v.optional(v.string()),
      sessionId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    // 1. Load original obligation
    const original = await ctx.db.get(args.originalObligationId);
    if (!original) {
      throw new ConvexError(
        `Original obligation not found: ${args.originalObligationId}`
      );
    }

    // 2. Validate original is settled (corrective only makes sense post-settlement)
    if (original.status !== "settled") {
      throw new ConvexError({
        code: "INVALID_CORRECTIVE_SOURCE" as const,
        message: "Corrective obligations can only be created from settled obligations",
        originalStatus: original.status,
        originalObligationId: args.originalObligationId,
      });
    }

    // 3. Validate reversed amount
    if (!Number.isSafeInteger(args.reversedAmount) || args.reversedAmount <= 0) {
      throw new ConvexError({
        code: "INVALID_CORRECTIVE_AMOUNT" as const,
        reversedAmount: args.reversedAmount,
      });
    }

    // 4. Idempotency: check if corrective already exists for this posting group
    const existingCorrective = await ctx.db
      .query("obligations")
      .withIndex("by_type_and_source", (q) =>
        q.eq("type", original.type).eq("sourceObligationId", args.originalObligationId)
      )
      .filter((q) => q.neq(q.field("type"), "late_fee"))
      .first();

    if (existingCorrective) {
      return { obligationId: existingCorrective._id, created: false };
    }

    // 5. Due date policy: immediate with fresh grace period
    const now = Date.now();
    const GRACE_PERIOD_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

    // 6. Create the corrective obligation
    const correctiveId = await ctx.db.insert("obligations", {
      status: "upcoming",
      mortgageId: original.mortgageId,
      borrowerId: original.borrowerId,
      paymentNumber: original.paymentNumber,
      type: original.type,
      amount: args.reversedAmount,
      amountSettled: 0,
      dueDate: now,
      gracePeriodEnd: now + GRACE_PERIOD_MS,
      sourceObligationId: args.originalObligationId,
      createdAt: now,
    });

    // 7. Accrue the corrective obligation in the cash ledger
    await postObligationAccrued(ctx, {
      obligationId: correctiveId,
      source: args.source as CommandSource,
    });

    return { obligationId: correctiveId, created: true };
  },
});
```

**IMPORTANT NOTES on the code sketch:**
- The idempotency check uses `by_type_and_source` which requires `type` as first field. Since we match on `original.type`, this works correctly. The filter for `q.neq("type", "late_fee")` is actually redundant when `original.type` is e.g. `regular_interest` — but the plan includes it as a safety guard. HOWEVER: note that the `by_type_and_source` index already constrains to `eq("type", original.type)` so if original.type is not "late_fee", the filter is unnecessary. Consider simplifying.
- The `source` arg validator uses `v.object(...)` with optional fields. Check the existing `CommandSource` type in `convex/engine/types.ts` for the exact shape and use the project's standard `commandSourceValidator` if one exists.

## Schema / Data Model

### Obligations Table (from `convex/schema.ts:524`)

```typescript
obligations: defineTable({
    // ─── GT fields ───
    status: v.string(),
    machineContext: v.optional(v.any()),
    lastTransitionAt: v.optional(v.number()),

    // ─── Relationships ───
    mortgageId: v.id("mortgages"),
    borrowerId: v.id("borrowers"),

    // ─── Payment identification ───
    paymentNumber: v.number(),

    // ─── Domain fields (all amounts in cents) ───
    type: v.union(
        v.literal("regular_interest"),
        v.literal("arrears_cure"),
        v.literal("late_fee"),
        v.literal("principal_repayment")
    ),
    amount: v.number(),
    amountSettled: v.number(), // cumulative cents settled
    dueDate: v.number(), // legacy system timestamp: Unix ms
    gracePeriodEnd: v.number(), // legacy system timestamp: Unix ms
    sourceObligationId: v.optional(v.id("obligations")), // for late_fee type — BUT ALSO USED FOR CORRECTIVES
    feeCode: v.optional(feeCodeValidator),
    mortgageFeeId: v.optional(v.id("mortgageFees")),
    settledAt: v.optional(v.number()),

    createdAt: v.number(),
})
    .index("by_status", ["status"])
    .index("by_mortgage", ["mortgageId", "status"])
    .index("by_mortgage_and_date", ["mortgageId", "dueDate"])
    .index("by_due_date", ["status", "dueDate"])
    .index("by_type_and_source", ["type", "sourceObligationId"])
    .index("by_type_source_and_fee_code", ["type", "sourceObligationId", "feeCode"])
    .index("by_borrower", ["borrowerId"]),
```

**CRITICAL**: `sourceObligationId` already exists. No schema change needed for the field itself.
**NEW INDEX NEEDED**: `by_source_obligation` on `["sourceObligationId"]` to enable querying all obligations (corrective AND late_fee) for a given source regardless of type.

### Obligation Type Decision

The implementation plan recommends **reusing the original type** (e.g., `regular_interest`) rather than adding a `corrective` literal to the union. The `sourceObligationId` linkage identifies it as corrective. This avoids a schema migration.

## Types & Interfaces

### CommandSource (from `convex/engine/types.ts`)

Check the exact shape of `CommandSource` in the codebase. The implementation plan uses:
```typescript
source: v.object({
    actorType: v.optional(v.string()),
    actorId: v.optional(v.string()),
    channel: v.optional(v.string()),
    ip: v.optional(v.string()),
    sessionId: v.optional(v.string()),
})
```

But the project may have a reusable `commandSourceValidator`. Look for it in `convex/engine/types.ts` or `convex/engine/validators.ts`.

### postObligationAccrued signature (from `convex/payments/cashLedger/integrations.ts:122`)

```typescript
export async function postObligationAccrued(
    ctx: MutationCtx,
    args: {
        obligationId: Id<"obligations">;
        source: CommandSource;
    }
)
```

This function:
1. Loads the obligation by ID
2. Gets/creates a BORROWER_RECEIVABLE account (scoped to mortgageId + obligationId + borrowerId)
3. Gets/creates a CONTROL:ACCRUAL account (scoped to mortgageId + obligationId)
4. Posts an OBLIGATION_ACCRUED entry via `postCashEntryInternal`
5. Uses idempotency key: `obligation-{obligationId}-accrued`

## Integration Points

### Late Fee Effect Pattern (from `convex/engine/effects/obligationLateFee.ts`)

The late fee effect shows the pattern for creating derivative obligations:
- Uses `sourceObligationId` to link late fees to original obligations
- Delegates to rules engine via `evaluateRules`
- Is an internalMutation registered in the effect registry

**Corrective obligation differs**: it's called directly (not via rules engine), and it's called from the reversal flow (not from the GT effect system).

## Constraints & Rules

- **From Tech Design §5.2**: Original obligation MUST remain `settled` — no GT transitions on the original
- **From CLAUDE.md**: State machines as backbone — corrective obligation enters normal machine lifecycle (starts at `upcoming`)
- **From CLAUDE.md**: Seed, don't build flows — corrective obligation is created by internal mutation, not a multi-step UI flow
- **From CLAUDE.md**: NEVER USE `any` as a type unless absolutely necessary
- **From CLAUDE.md**: Always prefer loose coupling and dependency injection
- **From Schema**: `sourceObligationId` already exists and is indexed — no schema migration needed for the field
- **From Obligation Machine**: `settled` is `type: "final"` — this is by design, not a limitation
- **Amounts in cents**: All monetary amounts are safe integers in cents. No floating-point arithmetic.

## File Structure

- New file: `convex/payments/obligations/createCorrectiveObligation.ts`
- Modified file: `convex/schema.ts` (add `by_source_obligation` index only)
- Existing: `convex/payments/cashLedger/integrations.ts` (import `postObligationAccrued` from here)
- Existing: `convex/engine/types.ts` (import `CommandSource` from here)
