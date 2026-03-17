# Chunk Context: reservation-tests-and-verify

Source: Linear ENG-34, ENG-36, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

### Step 3: Write reservation tests
Create `convex/ledger/__tests__/reservation.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
// Use existing test harness patterns from postEntry.test.ts

describe("reserveShares", () => {
  // ── Happy Path ──
  it("reserves shares: creates reservation, locks pending, posts SHARES_RESERVED journal", async () => {
    // Setup: mint mortgage, issue 5000 to seller
    // Act: call reserveShares for 3000 units
    // Assert:
    //   - Returns { reservationId, journalEntry }
    //   - journalEntry.entryType === "SHARES_RESERVED"
    //   - journalEntry.amount === 3000
    //   - seller.pendingCredits increased by 3000
    //   - buyer.pendingDebits increased by 3000
    //   - seller.cumulativeDebits/Credits UNCHANGED (AUDIT_ONLY)
    //   - reservation.status === "pending"
    //   - reservation.sellerAccountId, buyerAccountId correct
    //   - reservation.reserveJournalEntryId links to journal entry
  });

  // ── Mutex Behavior ──
  it("mutex: second reservation reduces available balance by first reservation amount", async () => {
    // Setup: seller has 10,000 units
    // Act 1: reserve 8,000 for Deal 1
    // Assert: seller.available = 2,000 (10,000 posted - 8,000 pending)
    // Act 2: attempt reserve 3,000 for Deal 2
    // Assert: REJECTED — only 2,000 available
    // Act 3: reserve 2,000 for Deal 2
    // Assert: SUCCESS — exactly 2,000 available, sell-all allowed (goes to 0)
  });

  // ── Insufficient Balance ──
  it("rejects when seller available balance < amount", async () => {
    // Setup: seller has 3,000 units
    // Act: try to reserve 4,000
    // Assert: ConvexError with code "INSUFFICIENT_BALANCE"
  });

  // ── Min Fraction: Seller ──
  it("rejects when seller post-reservation balance violates min fraction", async () => {
    // Setup: seller has 1,500 units
    // Act: try to reserve 600 (would leave seller with 900 < MIN_FRACTION)
    // Assert: ConvexError with code "MIN_FRACTION_VIOLATED"
  });

  it("allows sell-all: seller balance goes to exactly 0", async () => {
    // Setup: seller has 3,000 units
    // Act: reserve 3,000 (all units)
    // Assert: SUCCESS — 0 is allowed (sell-all exception)
  });

  // ── Min Fraction: Buyer ──
  it("rejects when buyer post-reservation balance violates min fraction", async () => {
    // Setup: buyer has 0 units (new position)
    // Act: try to reserve 500 (would give buyer 500 < MIN_FRACTION)
    // Assert: ConvexError with code "MIN_FRACTION_VIOLATED"
  });

  it("allows buyer to receive exactly MIN_FRACTION", async () => {
    // Setup: buyer has 0 units
    // Act: reserve 1,000 units (exactly MIN_FRACTION)
    // Assert: SUCCESS
  });

  // ── Idempotency ──
  it("idempotent: duplicate idempotencyKey returns existing reservation", async () => {
    // Act: call reserveShares twice with same idempotencyKey
    // Assert: both return same reservationId and journalEntry
    // Assert: seller.pendingCredits only incremented ONCE
  });

  // ── Edge Cases ──
  it("rejects seller === buyer", async () => {
    // sellerLenderId === buyerLenderId
    // Assert: ConvexError with code "SAME_ACCOUNT"
  });

  it("sets dealId on reservation when provided", async () => {
    // Assert: reservation.dealId matches input
  });

  it("links reservationId on journal entry", async () => {
    // Assert: journalEntry.reservationId === reservationId
  });
});
```

### Step 4: Run full verification
```bash
bunx convex codegen
bun check
bun typecheck
bun run test
```

## Downstream Test Requirement (ENG-36)

### reservation.test.ts
- [ ] Reserve → commit happy path: A holds 10,000 → reserve 3,000 → A.available=7,000, A.posted=10,000 → commit → A.posted=7,000, C.posted=3,000, all pending fields zeroed
- [ ] Reserve → void happy path: reserve 3,000 → void → A.available restored to 10,000, no cumulative changes
- [ ] Mutex behavior: A holds 10,000, reserve 8,000 for Deal 1, then attempt reserve 3,000 for Deal 2 → rejected (only 2,000 available). Reserve 2,000 → accepted.
- [ ] Double-commit prevention: commit already-committed reservation → ConvexError, zero side effects
- [ ] Double-void prevention: void already-voided → ConvexError
- [ ] Commit-after-void: → ConvexError
- [ ] Void-after-commit: → ConvexError

## Use Case Context

## Acceptance Criteria
- reserveShares locks units when deal is initiated — seller's pendingCredits increases, buyer's pendingDebits increases, seller's available balance decreases
- A subsequent deal attempting to reserve more than the seller's available balance is rejected
- On deal close: commitReservation converts reservation to posted transfer
- On deal failure: voidReservation releases the locked units
- Immediate transferShares (without reservation) remains available for seed data and admin operations

## Existing Local Test Harness

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

const LEDGER_TEST_IDENTITY = {
  subject: "test-ledger-user",
  issuer: "https://api.workos.com",
  org_id: FAIRLEND_STAFF_ORG_ID,
  organization_name: "FairLend Staff",
  role: "admin",
  roles: JSON.stringify(["admin"]),
  permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
  user_email: "ledger-test@fairlend.ca",
  user_first_name: "Ledger",
  user_last_name: "Tester",
};

function createTestHarness() {
  return convexTest(schema, modules);
}

function asLedgerUser(t: ReturnType<typeof createTestHarness>) {
  return t.withIdentity(LEDGER_TEST_IDENTITY);
}

const SYS_SOURCE = { type: "system" as const, channel: "test" };
```

Key setup already used in the repo:
```typescript
await auth.mutation(api.ledger.sequenceCounter.initializeSequenceCounter, {});
await auth.mutation(api.ledger.mutations.mintMortgage, {
  mortgageId,
  effectiveDate: "2026-01-01",
  idempotencyKey,
  source: SYS_SOURCE,
});
await auth.mutation(api.ledger.mutations.issueShares, {
  mortgageId,
  lenderId,
  amount,
  effectiveDate: "2026-01-01",
  idempotencyKey,
  source: SYS_SOURCE,
});
```

## Constraints
- Use the existing `convex-test` + Vitest patterns already present in `accounts.test.ts`, `postEntry.test.ts`, and `queries.test.ts`.
- The repo requires `bun check`, `bun typecheck`, and `bunx convex codegen` to pass before the work is considered done.
- `reserveShares` is an `internalMutation`, but tests can still call it through the generated `internal` API surface.
- `SHARES_RESERVED` is AUDIT_ONLY, so reservation tests must assert pending field changes without cumulative debit/credit changes.
