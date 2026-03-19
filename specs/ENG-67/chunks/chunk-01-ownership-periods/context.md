# Chunk 01 Context: Ownership Period Reconstruction

Source: Linear `ENG-67`, Notion implementation plan + linked pages, and verified local code.

## Implementation Plan Excerpt

> **Status:** Ready for Implementation — Partial Implementation Complete
>
> ### 2.2 NOT Yet Implemented ✗
> `convex/accrual/ownershipPeriods.ts` — `getOwnershipPeriods()` — derives timeline from journal
>
> ### 3.4 Previous Plan Errors — CORRECTED
> Plan showed `accountId` field in `OwnershipPeriod` → Actual type has `lenderId`, no `accountId` field
> Plan mentioned `getMortgageHistory()` → Function doesn't exist; use `getAccountHistory()`
> Plan showed `authedQuery` → Use `ledgerQuery` from `../fluent`
>
> ### 3.3 Entry Types — Verified
> Track for ownership:
> - `MORTGAGE_MINTED`
> - `SHARES_ISSUED`
> - `SHARES_TRANSFERRED`
> - `SHARES_REDEEMED`
>
> Skip (audit-only, pending):
> - `SHARES_RESERVED`
> - `SHARES_VOIDED`

## Spec Excerpt

```typescript
export type OwnershipPeriod = {
  lenderId: Id<"lenders">;
  mortgageId: Id<"mortgages">;
  fraction: number;
  fromDate: string;
  toDate: string | null;
};

/**
 * Derives ownership periods for a single investor on a single mortgage.
 * Reads ledger journal entries and builds a timeline of { fraction, fromDate, toDate }.
 *
 * The effectiveDate on journal entries is the business date of the ownership change.
 * Closing date accrues to the SELLER — meaning the seller's last period includes
 * the closing date, and the buyer's first period starts the day after.
 */
```

## Feature / Requirement Excerpts

> Reconstructs ownership periods from ledger journal entries (`SHARES_ISSUED`, `SHARES_COMMITTED`, `SHARES_REDEEMED`). For a given mortgage and investor, builds a timeline of `{ fraction, fromDate, toDate }` periods.

> Closing date accrues to the **seller**. Buyer's accrual starts the day after closing. This is derived naturally from ownership periods — no special proration logic needed.

> Given a deal closing on Jan 15: seller's accrual includes Jan 15, buyer's starts Jan 16.

## Verified Local Code Excerpts

```typescript
// convex/ledger/constants.ts
export const TOTAL_SUPPLY = 10_000n;
export const AUDIT_ONLY_ENTRY_TYPES: ReadonlySet<string> = new Set([
  "SHARES_RESERVED",
  "SHARES_VOIDED",
]);
```

```typescript
// convex/ledger/queries.ts
export const getPositions = ledgerQuery
  .input({ mortgageId: v.string() })
  .handler(async (ctx, args) => {
    const accounts = await ctx.db
      .query("ledger_accounts")
      .withIndex("by_type_and_mortgage", (q) =>
        q.eq("type", "POSITION").eq("mortgageId", args.mortgageId)
      )
      .collect();

    return nonZero.map((a) => ({
      lenderId: getAccountLenderId(a) as string,
      accountId: a._id,
      balance: getPostedBalance(a),
    }));
  })
  .public();
```

```typescript
// convex/schema.ts
ledger_accounts: defineTable({
  type: v.union(v.literal("WORLD"), v.literal("TREASURY"), v.literal("POSITION")),
  mortgageId: v.optional(v.string()),
  lenderId: v.optional(v.string()),
  cumulativeDebits: v.int64(),
  cumulativeCredits: v.int64(),
})
  .index("by_lender", ["lenderId"])
  .index("by_mortgage_and_lender", ["mortgageId", "lenderId"])
  .index("by_type_and_mortgage", ["type", "mortgageId"]);

ledger_journal_entries: defineTable({
  sequenceNumber: v.int64(),
  entryType: v.union(
    v.literal("MORTGAGE_MINTED"),
    v.literal("SHARES_ISSUED"),
    v.literal("SHARES_TRANSFERRED"),
    v.literal("SHARES_REDEEMED"),
    v.literal("MORTGAGE_BURNED"),
    v.literal("SHARES_RESERVED"),
    v.literal("SHARES_COMMITTED"),
    v.literal("SHARES_VOIDED"),
    v.literal("CORRECTION")
  ),
  mortgageId: v.string(),
  effectiveDate: v.string(),
  debitAccountId: v.id("ledger_accounts"),
  creditAccountId: v.id("ledger_accounts"),
  amount: v.union(v.number(), v.int64()),
})
  .index("by_debit_account", ["debitAccountId", "timestamp"])
  .index("by_credit_account", ["creditAccountId", "timestamp"]);
```

## Integration Points

> `getPositions(mortgageId)` → returns `{ lenderId, accountId, balance: bigint }[]`
>
> `getLenderPositions(lenderId)` → returns `{ mortgageId, accountId, balance: bigint }[]`
>
> `getAccountLenderId()` — handles legacy `investorId` → `lenderId` resolution

```typescript
// convex/ledger/accountOwnership.ts
export function getAccountLenderId(
  account: LegacyOwnedLedgerAccount
): string | undefined {
  return account.lenderId ?? account.investorId;
}
```

## Constraints & Rules

> - **No new tables** — accrual is pure computation, zero persistence
> - **Sub-cent precision** — NO rounding in accrual, only in dispersal layer
> - **Use `lender` terminology everywhere** (not `investor`)
> - **Balance is `bigint`** — convert with `Number()` for fraction math

## File Structure

```text
convex/
  accrual/
    ownershipPeriods.ts
    __tests__/
      ownershipPeriods.test.ts
      proration.test.ts
```
