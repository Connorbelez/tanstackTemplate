# Chunk 01 Context: commitReservation & voidReservation Mutations

## Linear Issue: ENG-35

### commitReservation (`convex/ledger/mutations.ts`)
- Converts pending reservation to posted transfer
- Decrements pending fields, updates cumulative fields via postEntry
- Posts SHARES_COMMITTED journal entry
- Updates reservation status to "committed"
- **Deterministic**: cannot fail given valid pending reservation (units already locked)

### voidReservation (`convex/ledger/mutations.ts`)
- Releases a pending reservation (deal cancelled/failed)
- Decrements pending fields (RELEASE), no cumulative changes
- Posts SHARES_VOIDED journal entry (audit record only)
- Updates reservation status to "voided"
- Requires reason string

### Acceptance Criteria (verbatim)
- commitReservation: loads reservation, checks status=="pending", decrements pending, posts SHARES_COMMITTED, updates reservation to "committed" with resolvedAt
- commitReservation is deterministic — no balance re-check needed (units already locked)
- voidReservation: loads reservation, checks status=="pending", decrements pending, posts SHARES_VOIDED, updates reservation to "voided" with resolvedAt + reason
- Double-commit: returns ConvexError (reservation already committed), zero side effects
- Double-void: returns ConvexError (reservation already voided), zero side effects
- Commit-after-void: returns ConvexError (reservation voided), zero side effects
- Both are internalMutation

---

## SPEC 1.3 — Key Design Properties

- `commitReservation` is deterministic — it cannot fail given a valid pending reservation, because the units are already locked. This eliminates the fire-and-forget problem for Deal Closing effects.
- `voidReservation` is safe — it only releases what was reserved. Available balance returns to its pre-reservation level.
- Both `commitReservation` and `voidReservation` are idempotent on the reservation status check — calling commit on an already-committed reservation returns an error without side effects.
- SHARES_RESERVED entries do NOT update cumulative fields (units are pending, not posted). Only SHARES_COMMITTED updates cumulatives. SHARES_VOIDED updates neither — it's purely an audit record of the release.
- The supply invariant still holds: pending fields are orthogonal to posted balances. TREASURY + Σ POSITION (posted) = 10,000 at all times.

---

## SPEC Pseudocode — commitReservation

```typescript
export const commitReservation = internalMutation({
  args: {
    reservationId: v.id("reservations"),  // NOTE: actual table is "ledger_reservations"
    effectiveDate: v.string(),
    idempotencyKey: v.string(),
    source: sourceValidator,
  },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation) throw new ConvexError("Reservation not found");
    if (reservation.status !== "pending") {
      throw new ConvexError(`Reservation already ${reservation.status}`);
    }

    // Decrement pending fields
    const seller = await ctx.db.get(reservation.sellerAccountId);
    const buyer = await ctx.db.get(reservation.buyerAccountId);
    await ctx.db.patch(seller!._id, {
      pendingCredits: seller!.pendingCredits - BigInt(reservation.amount),
    });
    await ctx.db.patch(buyer!._id, {
      pendingDebits: buyer!.pendingDebits - BigInt(reservation.amount),
    });

    // Post SHARES_COMMITTED entry (updates cumulative fields via postEntry)
    const journalEntry = await postEntry(ctx, {
      entryType: "SHARES_COMMITTED",
      mortgageId: reservation.mortgageId,
      debitAccountId: reservation.buyerAccountId,
      creditAccountId: reservation.sellerAccountId,
      amount: reservation.amount,
      effectiveDate: args.effectiveDate,
      idempotencyKey: args.idempotencyKey,
      source: args.source,
      metadata: { reservationId: args.reservationId },
    });

    // Update reservation status
    await ctx.db.patch(args.reservationId, {
      status: "committed",
      commitJournalEntryId: journalEntry._id,
      resolvedAt: Date.now(),
    });

    return { journalEntry };
  },
});
```

## SPEC Pseudocode — voidReservation

```typescript
export const voidReservation = internalMutation({
  args: {
    reservationId: v.id("reservations"),  // NOTE: actual table is "ledger_reservations"
    idempotencyKey: v.string(),
    source: sourceValidator,
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation) throw new ConvexError("Reservation not found");
    if (reservation.status !== "pending") {
      throw new ConvexError(`Reservation already ${reservation.status}`);
    }

    // Decrement pending fields (release the lock)
    const seller = await ctx.db.get(reservation.sellerAccountId);
    const buyer = await ctx.db.get(reservation.buyerAccountId);
    await ctx.db.patch(seller!._id, {
      pendingCredits: seller!.pendingCredits - BigInt(reservation.amount),
    });
    await ctx.db.patch(buyer!._id, {
      pendingDebits: buyer!.pendingDebits - BigInt(reservation.amount),
    });

    // Post SHARES_VOIDED journal entry (for audit trail — does NOT update cumulatives)
    const journalEntry = await postEntry(ctx, {
      entryType: "SHARES_VOIDED",
      mortgageId: reservation.mortgageId,
      debitAccountId: reservation.sellerAccountId,   // reverse: seller gets "back"
      creditAccountId: reservation.buyerAccountId,    // reverse: buyer gives "back"
      amount: reservation.amount,
      effectiveDate: args.effectiveDate,
      idempotencyKey: args.idempotencyKey,
      source: args.source,
      reason: args.reason,
      metadata: { reservationId: args.reservationId, reason: args.reason },
    });

    // Update reservation status
    await ctx.db.patch(args.reservationId, {
      status: "voided",
      voidJournalEntryId: journalEntry._id,
      resolvedAt: Date.now(),
    });

    return { journalEntry };
  },
});
```

---

## Existing Codebase Contracts

### Validators (already defined in `convex/ledger/validators.ts`)

```typescript
export const commitReservationArgsValidator = {
  reservationId: v.id("ledger_reservations"),
  effectiveDate: v.string(),
  idempotencyKey: v.string(),
  source: eventSourceValidator,
};

export const voidReservationArgsValidator = {
  reservationId: v.id("ledger_reservations"),
  reason: v.string(),
  effectiveDate: v.string(),
  idempotencyKey: v.string(),
  source: eventSourceValidator,
};
```

### Schema: `ledger_reservations` table (from `convex/schema.ts`)

```typescript
ledger_reservations: defineTable({
  mortgageId: v.string(),
  sellerAccountId: v.id("ledger_accounts"),
  buyerAccountId: v.id("ledger_accounts"),
  amount: v.number(),
  status: v.union(
    v.literal("pending"),
    v.literal("committed"),
    v.literal("voided")
  ),
  dealId: v.optional(v.string()),
  reserveJournalEntryId: v.id("ledger_journal_entries"),
  commitJournalEntryId: v.optional(v.id("ledger_journal_entries")),
  voidJournalEntryId: v.optional(v.id("ledger_journal_entries")),
  createdAt: v.number(),
  resolvedAt: v.optional(v.number()),
})
  .index("by_mortgage", ["mortgageId", "status"])
  .index("by_seller", ["sellerAccountId", "status"])
  .index("by_deal", ["dealId"]),
```

### Constants (from `convex/ledger/constants.ts`)

```typescript
export const TOTAL_SUPPLY = 10_000n;
export const MIN_FRACTION = 1_000n;

// AUDIT_ONLY entry types: do NOT update cumulativeDebits/cumulativeCredits
// SHARES_COMMITTED is intentionally EXCLUDED — it updates cumulatives normally
export const AUDIT_ONLY_ENTRY_TYPES: ReadonlySet<string> = new Set([
  "SHARES_RESERVED",
  "SHARES_VOIDED",
]);
```

### Entry Type Account Map (from `convex/ledger/types.ts`)

```typescript
SHARES_COMMITTED: { debit: ["POSITION"], credit: ["POSITION"] },
SHARES_VOIDED: { debit: ["POSITION"], credit: ["POSITION"] },
```

### postEntry Interface (from `convex/ledger/postEntry.ts`)

```typescript
export interface PostEntryInput {
  amount: number;
  causedBy?: Id<"ledger_journal_entries">;
  creditAccountId: Id<"ledger_accounts">; // account GIVING units
  debitAccountId: Id<"ledger_accounts">;  // account RECEIVING units
  effectiveDate: string;
  entryType: EntryType;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  mortgageId: string;
  reason?: string;
  reservationId?: Id<"ledger_reservations">;
  source: EventSource;
}
```

### Existing `reserveShares` Pattern (from `convex/ledger/mutations.ts`)

The `reserveShares` mutation is the model for implementation style:
- Uses `internalMutation` with args validator
- Error codes use `as const` (e.g., `code: "RESERVATION_NOT_FOUND" as const`)
- Uses `BigInt()` for amount arithmetic
- Patches journal entry with `reservationId` after creation
- Returns `{ reservationId, journalEntry }` shaped result

### Existing Imports in `mutations.ts`

```typescript
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { adminMutation, ledgerMutation } from "../fluent";
import {
  getOrCreatePositionAccount,
  getPositionAccount,
  getPostedBalance,
  getTreasuryAccount,
  getWorldAccount,
  initializeWorldAccount,
} from "./accounts";
import { MIN_FRACTION, TOTAL_SUPPLY } from "./constants";
import { postEntry } from "./postEntry";
import type { EventSource } from "./types";
import {
  burnMortgageArgsValidator,
  issueSharesArgsValidator,
  mintAndIssueArgsValidator,
  mintMortgageArgsValidator,
  mintMortgageWithAllocationsArgsValidator,
  postEntryArgsValidator,
  redeemSharesArgsValidator,
  reserveSharesArgsValidator,
  transferSharesArgsValidator,
} from "./validators";
```

---

## Drift Notes (critical for correct implementation)

1. **File location**: Add mutations to `convex/ledger/mutations.ts` (NOT separate files)
2. **Table name**: Use `"ledger_reservations"` (NOT `"reservations"` as in spec pseudocode)
3. **Naming**: Use `lenderId` pattern (NOT `investorId`)
4. **voidReservation effectiveDate**: Accept from args (NOT hardcoded to current date)
5. **Reason storage**: Store `reason` in journal entry's `reason` field (NOT on reservation record)
6. **reservationId on journal entry**: Pass `reservationId: args.reservationId` to postEntry to link the journal entry back to the reservation
