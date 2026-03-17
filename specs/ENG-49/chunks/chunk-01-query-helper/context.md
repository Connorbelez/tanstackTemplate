# Context: Chunk 01 - Query + Helper

## Tasks
- T-001: Add `getInternalDeal` internalQuery to convex/deals/queries.ts
- T-002: Create `setReservationId` internalMutation in convex/engine/effects/dealClosing.ts

## Relevant Implementation Plan Sections

### Step 1: Add `getInternalDeal` query
**File:** `convex/deals/queries.ts`
Add an internalQuery to load a deal by ID. Effects need this to read deal fields (mortgageId, sellerId, buyerId, fractionalShare, closingDate, machineContext).
```typescript
export const getInternalDeal = internalQuery({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    const deal = await ctx.db.get(dealId);
    if (!deal) {
      throw new ConvexError({
        code: "DEAL_NOT_FOUND" as const,
        message: `Deal ${dealId} not found`,
      });
    }
    return deal;
  },
});
```

### Step 2: Create `setReservationId` internal mutation
**File:** `convex/engine/effects/dealClosing.ts`
Helper mutation to store reservationId in deal's machineContext. Must be a separate `internalMutation` because it's called from an `internalAction` via `ctx.runMutation`.
```typescript
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalAction, internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { effectPayloadValidator } from "../validators";
import type { DealMachineContext } from "../machines/deal.machine";

/**
 * Patches deal.machineContext with a reservationId.
 * Documented exception to "engine-only writes" rule —
 * reservationId is operational metadata consumed by effects, not state-machine state.
 */
export const setReservationId = internalMutation({
  args: {
    dealId: v.id("deals"),
    reservationId: v.id("ledger_reservations"),
  },
  handler: async (ctx, { dealId, reservationId }) => {
    const deal = await ctx.db.get(dealId);
    if (!deal) {
      throw new ConvexError({
        code: "DEAL_NOT_FOUND" as const,
        message: `Deal ${dealId} not found`,
      });
    }
    const currentContext = (deal.machineContext ?? {}) as DealMachineContext;
    await ctx.db.patch(dealId, {
      machineContext: { ...currentContext, reservationId },
    });
  },
});
```

## Key Constraints
- From CLAUDE.md: No `any` types unless absolutely necessary
- From SPEC 1.4 Open Question 3: `setReservationId` uses direct `ctx.db.patch` on `machineContext` — documented exception to "engine-only writes" rule
- `getInternalDeal` must be an `internalQuery` (not public) so effects can call it

## Integration Points
- `getInternalDeal` returns full deal record including: mortgageId, sellerId, buyerId, fractionalShare, closingDate, machineContext
- `setReservationId` patches machineContext with reservationId, preserving existing context fields
- Both will be used by the effects in chunk 02

## Ledger Contract (for context)
**reserveShares contract:**
```javascript
Args: {
  mortgageId: v.string(),
  sellerLenderId: v.string(),
  buyerLenderId: v.string(),
  amount: v.number(),
  effectiveDate: v.string(),     // ISO date "YYYY-MM-DD"
  idempotencyKey: v.string(),
  source: { type: string, actor?: string, channel?: string },
  dealId: v.optional(v.string()),
  metadata: v.optional(v.any()),
}
Returns: { reservationId: Id<"ledger_reservations">, journalEntry }
```

**voidReservation contract:**
```javascript
Args: {
  reservationId: v.id("ledger_reservations"),
  reason: v.string(),
  effectiveDate: v.string(),
  idempotencyKey: v.string(),
  source: { type: string, actor?: string, channel?: string },
}
Returns: { journalEntry }
```
