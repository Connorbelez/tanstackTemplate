# Context: Chunk 02 - Effects Implementation

## Tasks
- T-003: Implement `reserveShares` effect
- T-004: Implement `voidReservation` effect
- T-005: Update Effect Registry

## Relevant Implementation Plan Sections

### Step 3: Implement `reserveShares` effect
**File:** `convex/engine/effects/dealClosing.ts`

```typescript
/**
 * Effect: reserves fractional shares in the ownership ledger on DEAL_LOCKED.
 * Calls ledger reserveShares() with idempotency key.
 * Stores returned reservationId in deal's machineContext.
 * On insufficient balance: logs error, does NOT throw (deal stays in lawyerOnboarding.pending).
 */
export const reserveShares = internalAction({
  args: effectPayloadValidator,
  handler: async (ctx, args) => {
    const deal = await ctx.runQuery(
      internal.deals.queries.getInternalDeal,
      { dealId: args.entityId as Id<"deals"> }
    );

    const effectiveDate = deal.closingDate
      ? new Date(deal.closingDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    try {
      const { reservationId } = await ctx.runMutation(
        internal.ledger.mutations.reserveShares,
        {
          mortgageId: deal.mortgageId,
          sellerLenderId: deal.sellerId,
          buyerLenderId: deal.buyerId,
          amount: deal.fractionalShare,
          effectiveDate,
          idempotencyKey: `deal:${deal._id}:reserve`,
          source: { type: "system", channel: "deal_closing" },
          dealId: deal._id,
        }
      );

      await ctx.runMutation(
        internal.engine.effects.dealClosing.setReservationId,
        { dealId: deal._id, reservationId }
      );

      console.info(
        `[reserveShares] Reserved ${deal.fractionalShare} shares for deal=${deal._id}, reservationId=${reservationId}`
      );
    } catch (error) {
      // Graceful failure — log but don't throw.
      // Deal stays in lawyerOnboarding.pending without a reservationId.
      // Detectable by reconciliation query (UC-DC-08).
      console.error(
        `[reserveShares] Failed for deal=${deal._id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  },
});
```

**Key decisions:**
- `internalAction` (not mutation) — needs to call both `ctx.runQuery` and `ctx.runMutation`
- `try/catch` around ledger call — per AC and UC-DC-08, failure is non-fatal
- `effectiveDate` derived from `deal.closingDate` (set by DEAL_LOCKED payload)
- Ledger source uses `{ type: "system", channel: "deal_closing" }` matching ledger's `eventSourceValidator`
- `args.entityId` cast to `Id<"deals">` — safe because effectPayloadValidator passes entityId as string but the engine guarantees it's a valid deal ID for deal entity type

### Step 4: Implement `voidReservation` effect
**File:** `convex/engine/effects/dealClosing.ts`

```typescript
/**
 * Effect: voids a ledger reservation on DEAL_CANCELLED.
 * Handles missing reservationId (deal cancelled before lock) by exiting cleanly.
 * Idempotent via ledger's idempotency key mechanism.
 */
export const voidReservation = internalAction({
  args: effectPayloadValidator,
  handler: async (ctx, args) => {
    const deal = await ctx.runQuery(
      internal.deals.queries.getInternalDeal,
      { dealId: args.entityId as Id<"deals"> }
    );

    const machineContext = (deal.machineContext ?? {}) as DealMachineContext;
    if (!machineContext.reservationId) {
      console.info(
        `[voidReservation] No reservationId for deal=${deal._id} — cancelled before lock, exiting cleanly`
      );
      return;
    }

    const reason =
      (args.payload as Record<string, unknown> | undefined)?.reason
        ? String((args.payload as Record<string, unknown>).reason)
        : "Deal cancelled";

    try {
      await ctx.runMutation(
        internal.ledger.mutations.voidReservation,
        {
          reservationId: machineContext.reservationId as Id<"ledger_reservations">,
          reason,
          effectiveDate: new Date().toISOString().split("T")[0],
          idempotencyKey: `deal:${deal._id}:void`,
          source: { type: "system", channel: "deal_closing" },
        }
      );

      console.info(
        `[voidReservation] Voided reservation=${machineContext.reservationId} for deal=${deal._id}`
      );
    } catch (error) {
      // RESERVATION_NOT_PENDING means already voided (idempotent retry)
      // RESERVATION_NOT_FOUND is unexpected but non-fatal
      console.error(
        `[voidReservation] Failed for deal=${deal._id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  },
});
```

**Key decisions:**
- Missing reservationId = clean exit (deal cancelled before DEAL_LOCKED)
- Extracts `reason` from event payload (DEAL_CANCELLED payload has `reason: string`)
- Catches `RESERVATION_NOT_PENDING` — means already voided on retry, non-fatal
- `effectiveDate` uses current date (void happens at cancellation time, not closing date)

### Step 5: Update Effect Registry
**File:** `convex/engine/effects/registry.ts`

Replace the 2 placeholder entries:
```typescript
// Before:
reserveShares: internal.engine.effects.dealClosingPlaceholder.placeholder,
voidReservation: internal.engine.effects.dealClosingPlaceholder.placeholder,

// After:
reserveShares: internal.engine.effects.dealClosing.reserveShares,
voidReservation: internal.engine.effects.dealClosing.voidReservation,
```

## Key Constraints
- From SPEC 1.4 Section 5.1: `reserveShares` handles ledger rejection gracefully (logs error, doesn't throw). Deal remains in `lawyerOnboarding.pending`.
- From UC-DC-08: If seller has insufficient balance, `reserveShares` effect fails silently. Deal is in `lawyerOnboarding.pending` without a `reservationId`.
- From SPEC 1.4 Section 5.3: `voidReservation` with no reservationId exits cleanly (deal cancelled before lock).

## Field Naming Note
AC says `sellerInvestorId, buyerInvestorId` but ledger uses `sellerLenderId, buyerLenderId`. Use ledger's actual field names.
