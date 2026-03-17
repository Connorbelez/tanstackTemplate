# Chunk Context: reserve-shares-mutation

Source: Linear ENG-34, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

**Issue:** [ENG-34 — Implement reserveShares mutation — two-phase reservation step 1 (lock units)](https://linear.app/fairlend/issue/ENG-34)
**Status:** Ready for implementation
**Estimate:** 3 points
**Blocks:** ENG-35 (commitReservation/voidReservation), ENG-36 (reservation test suites)
**Blocked By:** ENG-27 (postEntry pipeline — ✅ In Progress), ENG-28 (account helpers — ✅ Done)

## 1. Acceptance Criteria (verbatim from Linear)
- [ ] Takes mortgageId, sellerInvestorId, buyerInvestorId, amount, dealId (optional), effectiveDate, idempotencyKey, source
- [ ] Checks seller's *available* balance (posted - pendingCredits) >= amount
- [ ] Checks resulting seller balance: == 0 OR >= 1,000 (sell-all exception on available)
- [ ] Gets/creates buyer POSITION, checks resulting buyer balance >= 1,000
- [ ] Increments seller.pendingCredits by amount (LOCK)
- [ ] Increments buyer.pendingDebits by amount (LOCK)
- [ ] Posts SHARES_RESERVED journal entry (audit trail, does NOT update cumulatives)
- [ ] Creates `reservations` table entry with status="pending"
- [ ] Returns reservationId + journalEntry
- [ ] Mutex behavior: reserved units excluded from available balance, preventing over-commitment
- [ ] Auth: internalMutation (called by Deal Closing effects)
- [ ] Tests: happy path, insufficient available balance, mutex with multiple deals, min fraction on reservation

## 2. Drift Report
> **Summary:** All infrastructure is in place. The postEntry pipeline already handles SHARES_RESERVED as an AUDIT_ONLY entry type with correct constraint checks. The schema, validators, types, and constants are all ready. This is a **greenfield convenience mutation** that wires existing pieces together.

### Decision Point #1: `ledgerMutation` vs `internalMutation`
The Linear issue says **"Auth: internalMutation (called by Deal Closing effects)"**. The existing Tier 1-2 mutations use `ledgerMutation` (which requires `ledger:correct` permission via fluent-convex middleware).

Since `reserveShares` is called by Deal Closing machine effects (internal system calls, not user-initiated), it should be an **`internalMutation`** — not gated by user permissions. This matches the pattern used by `postEntryDirect`.

**Recommendation:** Use `internalMutation` for `reserveShares`. The Deal Closing machine is responsible for authorization before invoking.

### Decision Point #2: Separate file vs inline in mutations.ts
The Linear issue specifies `convex/ledger/mutations/reserveShares.ts`. However, all existing mutations live in `convex/ledger/mutations.ts` (flat file). Creating a `mutations/` directory would require migrating existing mutations.

**Recommendation:** Add to `convex/ledger/mutations.ts` as a new Tier 3 section, consistent with the existing pattern. If the file grows too large later, refactor into directory structure.

### Step 1: Add reserveShares to mutations.ts
Add imports and the new Tier 3 section after the existing Tier 2 mutations:
```typescript
import { internalMutation } from "../_generated/server";
import {
  getOrCreatePositionAccount,
  getPositionAccount,
  getAvailableBalance,
} from "./accounts";
import { reserveSharesArgsValidator } from "./validators";
import { postEntry } from "./postEntry";
```

**CRITICAL ORDERING INSIGHT:** The pending field updates and postEntry call must be carefully ordered. There are two valid approaches:

**Approach A (Recommended): postEntry first, then lock pending fields**
```typescript
export const reserveShares = internalMutation({
  args: reserveSharesArgsValidator,
  handler: async (ctx, args) => {
    // 1. Idempotency check
    const existingEntry = await ctx.db
      .query("ledger_journal_entries")
      .withIndex("by_idempotency", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey)
      )
      .first();
    if (existingEntry && existingEntry.reservationId) {
      const reservation = await ctx.db.get(existingEntry.reservationId);
      if (reservation) {
        return { reservationId: reservation._id, journalEntry: existingEntry };
      }
    }

    // 2. Resolve accounts
    const sellerAccount = await getPositionAccount(
      ctx, args.mortgageId, args.sellerLenderId
    );
    const buyerAccount = await getOrCreatePositionAccount(
      ctx, args.mortgageId, args.buyerLenderId
    );

    // 3. Post SHARES_RESERVED journal entry
    //    postEntry validates: amount > 0, accounts exist, type check
    //    (POSITION→POSITION), balance check (skipped for AUDIT_ONLY),
    //    constraint check (seller available >= amount, min fraction both sides).
    //    Constraint check uses CURRENT available balance (pre-lock).
    const journalEntry = await postEntry(ctx, {
      entryType: "SHARES_RESERVED",
      mortgageId: args.mortgageId,
      debitAccountId: buyerAccount._id,
      creditAccountId: sellerAccount._id,
      amount: args.amount,
      effectiveDate: args.effectiveDate,
      idempotencyKey: args.idempotencyKey,
      source: args.source,
      metadata: args.metadata,
    });

    // 4. LOCK: Increment pending fields AFTER postEntry validates
    //    Re-read accounts to get latest state (postEntry may have read them)
    const freshSeller = await ctx.db.get(sellerAccount._id);
    const freshBuyer = await ctx.db.get(buyerAccount._id);
    if (!freshSeller || !freshBuyer) {
      throw new ConvexError({
        code: "ACCOUNT_NOT_FOUND",
        message: "Account disappeared during reservation",
      });
    }

    await ctx.db.patch(sellerAccount._id, {
      pendingCredits: freshSeller.pendingCredits + BigInt(args.amount),
    });
    await ctx.db.patch(buyerAccount._id, {
      pendingDebits: freshBuyer.pendingDebits + BigInt(args.amount),
    });

    // 5. Create reservation record
    const reservationId = await ctx.db.insert("ledger_reservations", {
      mortgageId: args.mortgageId,
      sellerAccountId: sellerAccount._id,
      buyerAccountId: buyerAccount._id,
      amount: args.amount,
      status: "pending",
      dealId: args.dealId,
      reserveJournalEntryId: journalEntry._id,
      createdAt: Date.now(),
    });

    // 6. Backfill reservationId on journal entry
    await ctx.db.patch(journalEntry._id, { reservationId });

    return { reservationId, journalEntry };
  },
});
```

**Why Approach A:** postEntry's `constraintSharesReserved` checks `getAvailableBalance(seller)` which is `posted - pendingCredits`. If we increment `pendingCredits` BEFORE calling postEntry, the constraint would see the already-reduced available balance, effectively double-counting this reservation. By calling postEntry FIRST, the constraint validates against the true pre-reservation available balance, then we lock the pending fields afterward.

**Concurrency safety:** All operations happen within a single Convex mutation (atomic via OCC). If two concurrent `reserveShares` calls target the same seller, OCC will serialize them — the second call sees the first's pending increment and correctly rejects if insufficient balance.

## Use Case Context

## Acceptance Criteria
- reserveShares locks units when deal is initiated — seller's pendingCredits increases, buyer's pendingDebits increases, seller's available balance decreases
- A subsequent deal attempting to reserve more than the seller's available balance is rejected
- On deal close: commitReservation converts reservation to posted transfer
- On deal failure: voidReservation releases the locked units
- Immediate transferShares (without reservation) remains available for seed data and admin operations

## Integration Points

### Upstream Dependencies (blockedBy)
**ENG-27** (postEntry pipeline)
`postEntry(ctx, args): Promise<Doc<"ledger_journal_entries">>` — validates, persists journal entries. `SHARES_RESERVED` is AUDIT_ONLY (no cumulative updates). `constraintSharesReserved` checks seller available balance and min fraction on both sides.

`PostEntryInput.entryType = "SHARES_RESERVED"`, `debit = buyer POSITION`, `credit = seller POSITION`

**ENG-28** (account helpers)
`getPositionAccount(ctx, mortgageId, lenderId)`, `getOrCreatePositionAccount(ctx, mortgageId, lenderId)`, `getAvailableBalance(account)`, `getPostedBalance(account)`

Returns `Doc<"ledger_accounts">`. Available = `cumulativeDebits - cumulativeCredits - pendingCredits`

### Downstream Dependents (blocks)
**ENG-35** (commitReservation / voidReservation)
Reservation record with `status: "pending"`, `sellerAccountId`, `buyerAccountId`, `amount`, `reserveJournalEntryId`. Pending fields already incremented on accounts.

`commitReservation`: decrement pending fields, post `SHARES_COMMITTED` (updates cumulatives), set reservation `status: "committed"`. `voidReservation`: decrement pending fields, post `SHARES_VOIDED` (AUDIT_ONLY), set reservation `status: "voided"`.

**ENG-36** (reservation test suites)
Working `reserveShares` mutation to test against. Full reservation→commit and reservation→void flows.

Calls `internal.ledger.mutations.reserveShares` in tests.

## Deal Closing Effect Contract

```typescript
const { reservationId } = await ctx.runMutation(
  internal.ledger.mutations.reserveShares,
  {
    mortgageId: deal.mortgageId,
    sellerLenderId: deal.sellerId,
    buyerLenderId: deal.buyerId,
    amount: deal.fractionalShare,
    dealId: deal._id,
    effectiveDate: new Date(deal.closingDate).toISOString().split("T")[0],
    idempotencyKey: `deal:${deal._id}:reserve`,
    source: { type: "system", channel: "deal_closing" },
  }
);
```

## Constraints
- **From Spec §5.3:** SHARES_RESERVED and SHARES_VOIDED are AUDIT_ONLY — they do NOT update cumulativeDebits/cumulativeCredits.
- **From Spec:** Convention D-7: debitAccountId = account RECEIVING units, creditAccountId = account GIVING units.
- **From Spec:** REQ-84: Min fraction 1,000 units (10%). Position must be 0 or >= 1,000 after any operation.
- **From Spec:** REQ-OL-01: Idempotent — same idempotencyKey returns same result.
- **From Spec:** REQ-OL-04: Concurrent operations safely serialized via OCC.
- **From Codebase:** Field name is `lenderId` (not `investorId`). The AC says `sellerInvestorId` but the validator uses `sellerLenderId`.
- **From Codebase:** Existing mutations use `ledgerMutation.public()` pattern, but ENG-34 should use `internalMutation` per the AC.
