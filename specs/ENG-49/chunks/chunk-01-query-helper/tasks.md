# Chunk 01 Tasks: Query + Helper

## T-001: Add getInternalDeal internalQuery
**File:** `convex/deals/queries.ts`

Add an internalQuery that:
- Takes `dealId: v.id("deals")` as argument
- Returns the full deal record or throws ConvexError("DEAL_NOT_FOUND")
- Uses `internalQuery` from fluent-convex pattern

Follow existing patterns in the file for internalQuery exports.

## T-002: Create setReservationId internalMutation
**File:** `convex/deals/queries.ts` (add to existing file)

Add an internalMutation:
- Imports: v, ConvexError, internalMutation
- Export `setReservationId` internalMutation that:
  - Takes `dealId: v.id("deals")` and `reservationId: v.optional(v.id("ledger_reservations"))`
  - Gets deal from DB, throws if not found
  - Patches deal with updated top-level `reservationId` field

Note: Create the file with just this mutation first, then the effects will be added in chunk 02.

## Verification
After completing this chunk:
- Run `bunx convex codegen` to ensure types are generated
- File should compile without errors
