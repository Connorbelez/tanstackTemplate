# Chunk 02 Context: Reservation Lifecycle Tests

## Test Requirements (from ENG-35 AC + ENG-36)

### Test Cases

1. **reserve → commit happy path**: A holds 10,000 → reserve 3,000 → A.available=7,000, A.posted=10,000 → commit → A.posted=7,000, C.posted=3,000, all pending fields zeroed, reservation status="committed" with resolvedAt and commitJournalEntryId
2. **reserve → void happy path**: reserve 3,000 → void with reason → A.available restored to 10,000, no cumulative changes on either account, reservation status="voided" with resolvedAt and voidJournalEntryId, journal entry has reason
3. **Double-commit prevention**: commit already-committed reservation → ConvexError with code containing "NOT_PENDING", zero side effects
4. **Double-void prevention**: void already-voided → ConvexError, zero side effects
5. **Commit-after-void**: void then commit → ConvexError, zero side effects
6. **Void-after-commit**: commit then void → ConvexError, zero side effects

---

## Existing Test File Pattern

The test file `convex/ledger/__tests__/reservation.test.ts` already exists with reserveShares tests. New tests should be added to this same file.

### Existing Test Infrastructure (reuse these)

```typescript
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";
import { getAvailableBalance } from "../accounts";
import { reserveShares } from "../mutations";

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

### Existing Helper Functions (reuse these)

```typescript
async function initCounter(auth) {
  await auth.mutation(api.ledger.sequenceCounter.initializeSequenceCounter, {});
}

async function mintAndIssue(auth, mortgageId, lenderId, amount) {
  await auth.mutation(api.ledger.mutations.mintMortgage, { ... });
  return auth.mutation(api.ledger.mutations.issueShares, { ... });
}

async function getAccount(t, mortgageId, lenderId) { ... }

async function executeReserveShares(t, args) {
  return t.run(async (ctx) => reserveSharesMutation._handler(ctx, args));
}

async function getReservation(t, reservationId) {
  return t.run(async (ctx) => ctx.db.get(reservationId));
}

async function getJournalEntry(t, journalEntryId) {
  return t.run(async (ctx) => ctx.db.get(journalEntryId));
}

function getConvexErrorCode(error: unknown): string { ... }
```

### Pattern for accessing internalMutation handler in tests

```typescript
import { commitReservation, voidReservation } from "../mutations";

type CommitReservationArgs = {
  reservationId: Id<"ledger_reservations">;
  effectiveDate: string;
  idempotencyKey: string;
  source: { actor?: string; channel?: string; type: "cron" | "system" | "user" | "webhook" };
};

type CommitReservationResult = {
  journalEntry: Doc<"ledger_journal_entries">;
};

type CommitReservationMutation = {
  _handler: (ctx: MutationCtx, args: CommitReservationArgs) => Promise<CommitReservationResult>;
};

const commitReservationMutation = commitReservation as unknown as CommitReservationMutation;

async function executeCommitReservation(t, args) {
  return t.run(async (ctx) => commitReservationMutation._handler(ctx, args));
}

// Same pattern for voidReservation with reason field added to args type
```

---

## Key Verification Points Per Test

### T-006: reserve → commit happy path
- Seller posted balance decreases by amount (cumulativeCredits increases)
- Buyer posted balance increases by amount (cumulativeDebits increases)
- Both seller.pendingCredits and buyer.pendingDebits return to 0
- Reservation status === "committed"
- Reservation has resolvedAt (number, not null)
- Reservation has commitJournalEntryId linking to the SHARES_COMMITTED entry
- Journal entry.entryType === "SHARES_COMMITTED"
- Journal entry.reservationId links back to the reservation

### T-007: reserve → void happy path
- Seller cumulativeDebits/cumulativeCredits UNCHANGED (no cumulative movement)
- Buyer cumulativeDebits/cumulativeCredits UNCHANGED
- Both seller.pendingCredits and buyer.pendingDebits return to 0
- Seller available balance restored to pre-reservation level
- Reservation status === "voided"
- Reservation has resolvedAt
- Reservation has voidJournalEntryId
- Journal entry.entryType === "SHARES_VOIDED"
- Journal entry.reason === args.reason

### T-008 through T-011: Error cases
- The mutation throws ConvexError
- Use getConvexErrorCode() to verify the error code contains "NOT_PENDING"
- After the error, re-read the reservation and accounts to verify zero side effects:
  - Reservation status/resolvedAt/journalEntryIds unchanged
  - Account cumulative and pending fields unchanged

---

## Constants for Reference

```typescript
TOTAL_SUPPLY = 10_000n
MIN_FRACTION = 1_000n
```

## Account Balance Formulas

```typescript
postedBalance = cumulativeDebits - cumulativeCredits
availableBalance = postedBalance - pendingCredits
```
