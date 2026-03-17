# Context: Chunk 03 - Tests + Verification

## Tasks
- T-006: Write unit tests in convex/deals/__tests__/effects.test.ts
- T-007: Run verification: bunx convex codegen && bun check && bun typecheck

## Relevant Implementation Plan Sections

### Step 6: Write Tests
**File:** `convex/deals/__tests__/effects.test.ts`

```typescript
describe("reserveShares effect", () => {
  it("happy path: creates reservation and stores reservationId in machineContext");
  it("idempotency: calling twice returns same reservation");
  it("insufficient balance: logs error, does not throw");
  it("deal not found: throws DEAL_NOT_FOUND");
});

describe("voidReservation effect", () => {
  it("happy path: voids existing reservation");
  it("missing reservationId: exits cleanly without calling ledger");
  it("idempotency: calling twice on same deal does not error");
  it("already voided reservation: catches RESERVATION_NOT_PENDING gracefully");
});

describe("setReservationId helper", () => {
  it("patches machineContext with reservationId");
  it("preserves existing machineContext fields (dealId)");
  it("deal not found: throws DEAL_NOT_FOUND");
});
```

**Testing Guidance:**
- Tests should use `convex-test` with full DB setup (seed deal + ledger accounts + positions)
- Follow the pattern from `convex/ledger/__tests__/reservation.test.ts`
- For reserveShares: test successful reservation creation, idempotency, insufficient balance handling
- For voidReservation: test successful void, missing reservationId clean exit, idempotency
- For setReservationId: test patching machineContext, preserving existing fields

## Verification Commands
From CLAUDE.md:
- `bunx convex codegen` - Generate Convex types
- `bun check` - Lint, format and check errors (auto-fixes before reporting)
- `bun typecheck` - Type check
- `bun run test` - Run unit tests

## Acceptance Criteria to Verify
- [ ] reserveShares effect calls ledger reserveShares() with correct args
- [ ] reserveShares uses idempotencyKey deal:${dealId}:reserve
- [ ] reserveShares stores reservationId in machineContext via setReservationId
- [ ] reserveShares handles ledger rejection gracefully (logs error, doesn't throw)
- [ ] voidReservation effect calls ledger voidReservation() with reservationId
- [ ] voidReservation handles missing reservationId cleanly
- [ ] voidReservation uses idempotencyKey deal:${dealId}:void
- [ ] Both effects registered in Effect Registry
