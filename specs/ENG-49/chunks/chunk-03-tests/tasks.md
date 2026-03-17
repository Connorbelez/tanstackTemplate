# Chunk 03 Tasks: Tests + Verification

## T-006: Write unit tests
**File:** `convex/deals/__tests__/effects.test.ts` (new file)

Create comprehensive tests following existing test patterns in the codebase (see `convex/ledger/__tests__/reservation.test.ts` for reference).

### Test Suite: reserveShares effect
1. **happy path**: Creates reservation and stores reservationId in machineContext
   - Set up: deal with mortgageId, sellerId, buyerId, fractionalShare
   - Execute: call reserveShares effect
   - Assert: ledger reservation created, machineContext.reservationId set

2. **idempotency**: Calling twice returns same reservation
   - Set up: deal
   - Execute: call reserveShares twice with same idempotency key
   - Assert: same reservationId returned both times

3. **insufficient balance**: Logs error, does not throw
   - Set up: deal with seller who has insufficient balance
   - Execute: call reserveShares effect
   - Assert: error caught and logged, no exception thrown, deal remains unchanged

4. **deal not found**: Throws DEAL_NOT_FOUND
   - Set up: invalid dealId
   - Execute: call reserveShares effect
   - Assert: ConvexError with DEAL_NOT_FOUND code

### Test Suite: voidReservation effect
1. **happy path**: Voids existing reservation
   - Set up: deal with machineContext.reservationId
   - Execute: call voidReservation effect
   - Assert: ledger reservation voided

2. **missing reservationId**: Exits cleanly without calling ledger
   - Set up: deal without reservationId (cancelled before lock)
   - Execute: call voidReservation effect
   - Assert: returns early, no ledger call made

3. **idempotency**: Calling twice on same deal does not error
   - Set up: deal with reservationId
   - Execute: call voidReservation twice
   - Assert: both calls succeed (second call catches RESERVATION_NOT_PENDING)

4. **already voided reservation**: Catches RESERVATION_NOT_PENDING gracefully
   - Set up: deal with reservationId that's already voided
   - Execute: call voidReservation effect
   - Assert: error caught and logged, no exception thrown

### Test Suite: setReservationId helper
1. **patches machineContext with reservationId**
   - Set up: deal
   - Execute: call setReservationId
   - Assert: deal.machineContext.reservationId updated

2. **preserves existing machineContext fields (dealId)**
   - Set up: deal with existing machineContext containing dealId
   - Execute: call setReservationId
   - Assert: dealId preserved, reservationId added

3. **deal not found**: Throws DEAL_NOT_FOUND
   - Set up: invalid dealId
   - Execute: call setReservationId
   - Assert: ConvexError with DEAL_NOT_FOUND code

## T-007: Run verification
Run the following commands in order:
1. `bunx convex codegen`
2. `bun check`
3. `bun typecheck`
4. `bun run test`

Fix any issues that arise.
