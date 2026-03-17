# Chunk 02 Tasks: Effects Implementation

## T-003: Implement reserveShares effect
**File:** `convex/engine/effects/dealClosing.ts`

Add the `reserveShares` internalAction to the existing file (which has setReservationId from chunk 01):

1. Import required dependencies:
   - `internalAction` from _generated/server
   - `internal` from _generated/api
   - `Id` from _generated/dataModel
   - `effectPayloadValidator` from ../validators
   - `DealMachineContext` from ../machines/deal.machine

2. Implement `reserveShares` internalAction that:
   - Uses effectPayloadValidator for args
   - Loads deal via `ctx.runQuery(internal.deals.queries.getInternalDeal, ...)`
   - Computes effectiveDate from deal.closingDate
   - Calls `ctx.runMutation(internal.ledger.mutations.reserveShares, ...)` with:
     - mortgageId: deal.mortgageId
     - sellerLenderId: deal.sellerId (NOT sellerInvestorId)
     - buyerLenderId: deal.buyerId (NOT buyerInvestorId)
     - amount: deal.fractionalShare
     - effectiveDate: computed above
     - idempotencyKey: `deal:${deal._id}:reserve`
     - source: { type: "system", channel: "deal_closing" }
     - dealId: deal._id
   - On success: calls setReservationId mutation to store reservationId
   - On error: catches, logs error, does NOT throw (graceful failure)

## T-004: Implement voidReservation effect
**File:** `convex/engine/effects/dealClosing.ts`

Add the `voidReservation` internalAction:

1. Implements `voidReservation` internalAction that:
   - Uses effectPayloadValidator for args
   - Loads deal via ctx.runQuery
   - Gets machineContext.reservationId
   - If no reservationId: log info and return early (clean exit)
   - Extracts reason from args.payload or defaults to "Deal cancelled"
   - Calls `ctx.runMutation(internal.ledger.mutations.voidReservation, ...)` with:
     - reservationId: from machineContext
     - reason: extracted reason
     - effectiveDate: current date
     - idempotencyKey: `deal:${deal._id}:void`
     - source: { type: "system", channel: "deal_closing" }
   - On error: catches, logs error, does NOT throw (idempotent retry handling)

## T-005: Update Effect Registry
**File:** `convex/engine/effects/registry.ts`

Update the effect registry to point to the real handlers:
- Find `reserveShares` entry and change from placeholder to `internal.engine.effects.dealClosing.reserveShares`
- Find `voidReservation` entry and change from placeholder to `internal.engine.effects.dealClosing.voidReservation`

## Verification
After completing this chunk:
- Run `bunx convex codegen` to regenerate types
- Run `bun check` to check formatting/linting
- Run `bun typecheck` to verify types
