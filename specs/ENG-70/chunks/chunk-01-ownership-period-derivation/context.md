# Chunk Context: ownership-period-derivation

Source: Linear ENG-70, Notion requirement/spec/feature pages, and local ledger/accrual code.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

From `Ownership period derivation from ledger journal entries`:

> `getOwnershipPeriods` must reconstruct an investor's ownership timeline by scanning ledger journal entries. The algorithm queries `SHARES_ISSUED`, `SHARES_TRANSFERRED`, `SHARES_COMMITTED`, and `SHARES_REDEEMED` entries, filters out `SHARES_RESERVED` and `SHARES_VOIDED`, and builds a chronological list of `{fraction, fromDate, toDate}` periods.

Acceptance Criteria:

> 1. Single owner: one open period with fraction 1.0
> 2. Deal close: seller period includes closing date, buyer starts day after
> 3. Multiple transfers: correct period chain with no gaps/overlaps
> 4. Full exit: closed period with correct toDate
> 5. SHARES_RESERVED/VOIDED excluded from derivation

Rationale:

> Ownership period derivation is the bridge between the ownership ledger (Project 3) and the accrual computation engine. Every accrual calculation depends on correct period reconstruction.

From `Interest Accrual Computation Engine`:

> Reconstructs ownership periods from ledger journal entries (`SHARES_ISSUED`, `SHARES_COMMITTED`, `SHARES_REDEEMED`). For a given mortgage and investor, builds a timeline of `{ fraction, fromDate, toDate }` periods. Each period's accrual is `rate × fraction × days / 365 × principal`.

> Closing date accrues to the seller. Buyer's accrual starts the day after closing. This is derived naturally from ownership periods — no special proration logic needed.

## SPEC 1.6 Excerpt

From `SPEC 1.6 — Accrual & Dispersal Engine`, section `3.1 Ownership Period Derivation`:

```typescript
export type OwnershipPeriod = {
  lenderId: Id<"lenders">;
  mortgageId: Id<"mortgages">;
  fraction: number;           // 0-1 (units / 10000)
  fromDate: string;           // YYYY-MM-DD, inclusive
  toDate: string | null;      // YYYY-MM-DD, inclusive. null = still active
};

/**
 * Derives ownership periods for a single investor on a single mortgage.
 * Reads ledger journal entries and builds a timeline of { fraction, fromDate, toDate }.
 *
 * Algorithm:
 * 1. Query all journal entries for this mortgage, ordered by sequenceNumber
 * 2. Filter to entries involving this investor's POSITION account
 * 3. Walk entries chronologically, tracking running balance
 * 4. Each balance change creates a new period (close previous, open new)
 *
 * The effectiveDate on journal entries is the business date of the ownership change.
 * Closing date accrues to the SELLER — meaning the seller's last period includes
 * the closing date, and the buyer's first period starts the day after.
 */
```

## Corrected Drift from Current Codebase

From `ENG-67 — Interest Accrual Computation Engine (Replanned)`:

> `investorId: v.id("investors")` on ledger accounts → `lenderId: v.optional(v.string())` on `ledger_accounts`

> `accounts` table → `ledger_accounts` table

> `journalEntries` table → `ledger_journal_entries` table

> `by_mortgage_and_investor` → `by_mortgage_and_lender`

> `mortgage.principalBalance` → `mortgage.principal`

> `mortgage.annualRate` → `mortgage.interestRate`

Verified implementation guidance:

```typescript
const AUDIT_ONLY_TYPES = new Set(["SHARES_RESERVED", "SHARES_VOIDED"]);

export async function getOwnershipPeriods(
  ctx: { db: QueryCtx["db"] },
  mortgageId: Id<"mortgages">,
  lenderId: string,
): Promise<OwnershipPeriod[]> {
  const positionAccount = await ctx.db
    .query("ledger_accounts")
    .withIndex("by_mortgage_and_lender", q =>
      q.eq("mortgageId", mortgageId as string).eq("lenderId", lenderId)
    )
    .filter(q => q.eq(q.field("type"), "POSITION"))
    .first();

  if (!positionAccount) return [];
}
```

## Test Expectations

From `ENG-76 — Tests: Ownership Period Derivation`:

> - Single owner, no transfers → one open period
> - Deal close (seller + buyer periods, closing date in seller's period)
> - Multiple sequential transfers → correct period chain
> - Full exit (sell all) → closed period
> - SHARES_RESERVED/VOIDED excluded from derivation

Data seeding notes:

> Seed data uses actual schema field names (`ledger_accounts`, `ledger_journal_entries`, `lenderId`).

> `sequenceNumber` is `int64` — use `1n`, `2n`, etc.

> Closing date logic is subtle — seller's period includes `effectiveDate` for `SHARES_COMMITTED`; buyer starts day after.

## Local Types & Helpers

From `convex/accrual/types.ts`:

```typescript
export interface OwnershipPeriod {
  fraction: number;
  fromDate: string;
  lenderId: Id<"lenders">;
  mortgageId: Id<"mortgages">;
  toDate: string | null;
}
```

From `convex/ledger/constants.ts`:

```typescript
export const TOTAL_SUPPLY = 10_000n;

export const AUDIT_ONLY_ENTRY_TYPES: ReadonlySet<string> = new Set([
  "SHARES_RESERVED",
  "SHARES_VOIDED",
]);
```

From `convex/ledger/accountOwnership.ts`:

```typescript
export function getAccountLenderId(
  account: LegacyOwnedLedgerAccount
): string | undefined {
  return account.lenderId ?? account.investorId;
}
```

From `convex/ledger/accounts.ts`:

```typescript
export function getPostedBalance(
  account: Pick<Doc<"ledger_accounts">, "cumulativeDebits" | "cumulativeCredits">
): bigint {
  return account.cumulativeDebits - account.cumulativeCredits;
}
```

From `convex/ledger/queries.ts`:

```typescript
function compareSequenceNumbers(
  left: { sequenceNumber: bigint },
  right: { sequenceNumber: bigint }
) {
  if (left.sequenceNumber < right.sequenceNumber) {
    return -1;
  }
  if (left.sequenceNumber > right.sequenceNumber) {
    return 1;
  }
  return 0;
}
```

```typescript
export const getPositions = ledgerQuery
  .input({ mortgageId: v.string() })
  .handler(async (ctx, args) => {
    const accounts = await ctx.db
      .query("ledger_accounts")
      .withIndex("by_type_and_mortgage", (q) =>
        q.eq("type", "POSITION").eq("mortgageId", args.mortgageId)
      )
      .collect();

    const nonZero = accounts.filter((a) => getPostedBalance(a) > 0n);
```

From `convex/schema.ts`:

```typescript
ledger_accounts: defineTable({
  type: v.union(
    v.literal("WORLD"),
    v.literal("TREASURY"),
    v.literal("POSITION")
  ),
  mortgageId: v.optional(v.string()),
  lenderId: v.optional(v.string()),
  cumulativeDebits: v.int64(),
  cumulativeCredits: v.int64(),
  pendingDebits: v.optional(v.int64()),
  pendingCredits: v.optional(v.int64()),
  createdAt: v.number(),
  metadata: v.optional(v.any()),
})
  .index("by_mortgage", ["mortgageId"])
  .index("by_lender", ["lenderId"])
  .index("by_mortgage_and_lender", ["mortgageId", "lenderId"])
  .index("by_type_and_mortgage", ["type", "mortgageId"]),
```

```typescript
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
  reservationId: v.optional(v.id("ledger_reservations")),
  mortgageId: v.string(),
  effectiveDate: v.string(),
  timestamp: v.number(),
  debitAccountId: v.id("ledger_accounts"),
  creditAccountId: v.id("ledger_accounts"),
  amount: v.union(v.number(), v.int64()),
  idempotencyKey: v.string(),
```

## Constraints & Rules

- No new tables. `ENG-70` is pure read-side derivation.
- Keep the helper dependency-injected. Do not bind it to full Convex runtime state when `{ db }` is sufficient.
- Use repo terminology: `lender`, not `investor`, in all new code.
- Preserve full precision. No rounding belongs in ownership-period derivation.
- Respect the repo quality gate: `bun check`, `bun typecheck`, `bunx convex codegen`.

## File Structure

Target files for this chunk:

- `convex/accrual/ownershipPeriods.ts`
- `convex/accrual/__tests__/ownershipPeriods.test.ts`
