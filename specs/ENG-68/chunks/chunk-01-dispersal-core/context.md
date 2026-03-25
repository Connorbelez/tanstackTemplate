# Chunk Context: dispersal-core

Source: Linear `ENG-68`, Notion implementation plan v2, and verified local code.
This file and the accompanying `tasks.md` contain everything needed to implement this chunk.

## Implementation Plan Excerpt

```md
### DRIFT 1: NAMING — SPEC uses `investorId`, codebase uses `lenderId`
...
**Use `lenderId`** — schema uses it, types.ts uses it, ledger uses it
...
**Use `lenderAccountId`** — already in schema and types.ts
...
**Use `principal`** — confirmed in schema mortgage table (look for `principal`, NOT `principalBalance`)
...
**Use `ledger_accounts`** — confirmed in schema.ts line 933
...
`getPositions` returns `{ lenderId, accountId, balance: bigint }` — convert: `Number(balance) / 10000` for fraction
```

```md
### DRIFT 3: MISSING INTEGRATION — SPEC §4.1 does NOT mention `dealReroutes`
**Status:** `dealReroutes` table EXISTS with `by_mortgage` index ✅ (schema.ts line 866). But SPEC §4.1 `createDispersalEntries` does NOT include `dealReroutes` lookup. Per the Linear issue description, the dispersal engine MUST check `dealReroutes` by mortgage for any reroutes with `effectiveAfterDate <= settledDate`.

**Action:** Include `dealReroutes` checking in `createDispersalEntries` even though the SPEC omits it.
```

```md
### Must Build (ENG-68 scope)
#### 1. `convex/dispersal/calculateProRataShares.ts`
**Purpose:** Largest-remainder rounding for pro-rata distribution.

#### 2. `convex/dispersal/createDispersalEntries.ts`
**Purpose:** Core mutation — called by GT effect on OBLIGATION_SETTLED.
```

```md
## 🔗 Integration Points
**Obligation Machine (Project 5)** — Calls `createDispersalEntries` via GT effect on `OBLIGATION_SETTLED`. Event payload: `{ obligationId, mortgageId, settledAmount, settledDate }`

**dealReroutes table** — Read via `by_mortgage` index, filtered by `effectiveAfterDate <= settledDate`. Reroutes adjust position units before pro-rata calculation.

**Mortgage table** — Fields: `annualServicingRate` (default 0.01), `principal` (not `principalBalance`)

**Ledger (`ledger_accounts`)** — `getPositions` reads POSITION accounts. Schema uses `lenderId` and `lenderAccountId`. Balance is bigint — convert with `Number(balance) / 10000` for fraction.

**GT effect registration** — Register `createDispersalEntries` as effect target for `OBLIGATION_SETTLED`
```

```md
## ⚠️ Pre-Implementation Checks
1. Run `bunx convex codegen` to ensure schema types are up to date
2. Confirm `principal` field name on mortgage table
3. Confirm `ledger_accounts` POSITION account `lenderId` field exists (not `investorId`)
4. Verify `dealReroutes` mutation writes `fromOwnerId`/`toOwnerId` as `lenderId` strings
```

## Feature Page Excerpt

```md
### Pro-Rata Share Calculation
1. Read current ownership positions from ledger (`getPositions(mortgageId)`)
2. Deduct servicing fee: `(annualServicingRate × principal) / 12`
**Note:** Schema field name is `principal` — NOT `principalBalance`.
1. Distributable = settledAmount - servicingFee
2. Per-investor share = distributableAmount × (investorUnits / 10000)
```

```md
### Largest-Remainder Rounding
Sub-cent precision in intermediate calculations. Floor each share to the nearest cent. Distribute remaining cents to the largest fractional remainders. Guarantees distributed amounts sum to exactly the distributable total.
```

```md
### Idempotency
If dispersal entries already exist for an obligation (checked via `by_obligation` index), return existing entries without creating new ones. Prevents double-creation on GT effect retry.
```

## ENG-80 Excerpt

```md
### ⚠️ Critical: Cents-Based Arithmetic
**All amounts in this codebase are stored as integer cents**, not dollar floats:
- `mortgage.principal = 68_000_000` (= $680,000)
- Pattern: `Math.round((interestRate * principal) / periodsPerYear)` → integer cents

The servicing fee function MUST follow this convention.
```

```md
### Function Signature
export function calculateServicingFee(
  annualServicingRate: number,
  principalCents: number,
): number {
  return Math.round((annualServicingRate * principalCents) / 12);
}
```

## ENG-81 Excerpt

```md
### Acceptance Criteria
- 3 investors (3333/3333/3334 units), $10.00 → $3.33, $3.33, $3.34
- 2 investors (5000/5000 units), $100.01 → $50.01, $50.00
- Any N investors, any amount: sum === distributable
```

```md
### Data Structures
export type PositionShare = {
  accountId: Id<"ledger_accounts">;
  lenderId: Id<"lenders">;
  units: number;
  rawAmount: number;
  amount: number;
};
```

```md
### Step 2: Implement calculateProRataShares
1. Calculate `totalUnits = positions.reduce((sum, p) => sum + p.units, 0)`
2. For each position: `rawAmount = (units / totalUnits) * distributableAmount`
3. Floor each: `flooredAmount = Math.floor(rawAmount * 100) / 100`
4. Calculate remaining cents: `distributableCents - flooredCents`
5. Sort by remainder descending, tie-break by units descending
6. Distribute remaining cents one at a time to largest remainders
7. Return shares without the `remainder` internal field
```

## Integration Points From Related Linear Issues

```md
ENG-50:
Implement the three effects that fire at deal confirmation: `commitReservation` (ledger), `prorateAccrualBetweenOwners` (accrual), `updatePaymentSchedule` (payments).

### updatePaymentSchedule
- Finds future undisbursed obligations for seller's share
- Reroutes transferred share portion to buyer
- Idempotent: checks `metadata.reroutedByDealId` before modifying
```

```md
ENG-67:
Key corrections made to implementation plan:
- Use `mortgage.interestRate` not `annualRate`
- Use `mortgage.principal` not `principalBalance`
- Use `by_mortgage_and_lender` index not `by_mortgage_and_investor`
- Use `ledgerQuery` from `../fluent`
```

## Repo Verification Snippets

```ts
// convex/schema.ts
dealReroutes: defineTable({
  dealId: v.id("deals"),
  mortgageId: v.id("mortgages"),
  fromOwnerId: v.string(),
  toOwnerId: v.string(),
  fractionalShare: v.number(),
  effectiveAfterDate: v.string(),
  createdAt: v.number(),
})
  .index("by_deal", ["dealId"])
  .index("by_mortgage", ["mortgageId"]),

dispersalEntries: defineTable({
  mortgageId: v.id("mortgages"),
  lenderId: v.id("lenders"),
  lenderAccountId: v.id("ledger_accounts"),
  amount: v.number(),
  dispersalDate: v.string(),
  obligationId: v.id("obligations"),
  servicingFeeDeducted: v.number(),
  status: dispersalStatusValidator,
  idempotencyKey: v.string(),
  calculationDetails: calculationDetailsValidator,
  createdAt: v.number(),
})
  .index("by_lender", ["lenderId", "dispersalDate"])
  .index("by_mortgage", ["mortgageId", "dispersalDate"])
  .index("by_obligation", ["obligationId"])
  .index("by_status", ["status", "lenderId"])
  .index("by_idempotency", ["idempotencyKey"]),
```

```ts
// convex/schema.ts
principal: v.number(),
interestRate: v.number(),
...
annualServicingRate: v.optional(v.number()),
```

```ts
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

    const nonZero = accounts.filter((a) => getPostedBalance(a) > 0n);
    return nonZero.map((a) => ({
      lenderId: getAccountLenderId(a) as string,
      accountId: a._id,
      balance: getPostedBalance(a),
    }));
  })
  .public();
```

```ts
// convex/engine/effects/dealClosingPayments.ts
await ctx.runMutation(internal.dealReroutes.mutations.insert, {
  dealId,
  mortgageId: deal.mortgageId,
  fromOwnerId: deal.sellerId,
  toOwnerId: deal.buyerId,
  fractionalShare: deal.fractionalShare,
  effectiveAfterDate,
  createdAt: Date.now(),
});
```

```ts
// convex/engine/effects/obligation.ts
await ctx.scheduler.runAfter(
  0,
  internal.payments.dispersal.stubs.createDispersalEntry,
  {
    mortgageId: obligation.mortgageId,
    obligationId: args.entityId,
    amount: obligation.amount,
  }
);
```

```ts
// convex/dispersal/servicingFee.ts (current repo state)
export function calculateServicingFee(
  annualServicingRate: number,
  principalBalance: number
): number {
  return (
    Math.round(((annualServicingRate * principalBalance) / 12) * 100) / 100
  );
}
```

## Constraints & Rules

```md
- WorkOS AuthKit is the canonical source of truth.
- `bun check`, `bun typecheck` and `bunx convex codegen` must pass before considering tasks completed.
- NEVER USE `any` as a type unless you absolutely have to.
- Always prefer loose coupling and dependency injection.
```
