# Chunk 01 Context: Core Implementation

## Goal
Create `convex/payments/obligations/generate.ts` and `convex/payments/obligations/queries.ts` — the obligation generation pipeline and query layer.

## Schema (Verbatim from convex/schema.ts)

### obligations table (lines 507-540)
```typescript
obligations: defineTable({
  // ─── GT fields ───
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),

  // ─── Relationships ───
  mortgageId: v.id("mortgages"),
  borrowerId: v.id("borrowers"),

  // ─── Payment identification ───
  paymentNumber: v.number(),

  // ─── Domain fields (all amounts in cents) ───
  type: v.union(
    v.literal("regular_interest"),
    v.literal("arrears_cure"),
    v.literal("late_fee"),
    v.literal("principal_repayment")
  ),
  amount: v.number(),
  amountSettled: v.number(), // cumulative cents settled
  dueDate: v.number(), // unix timestamp
  gracePeriodEnd: v.number(), // unix timestamp
  sourceObligationId: v.optional(v.id("obligations")), // for late_fee type
  settledAt: v.optional(v.number()),

  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_mortgage", ["mortgageId", "status"])
  .index("by_mortgage_and_date", ["mortgageId", "dueDate"])
  .index("by_due_date", ["dueDate", "status"])
  .index("by_borrower", ["borrowerId"]),
```

### mortgages table (lines 415-471)
```typescript
mortgages: defineTable({
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  propertyId: v.id("properties"),
  principal: v.number(),
  interestRate: v.number(),
  rateType: v.union(v.literal("fixed"), v.literal("variable")),
  termMonths: v.number(),
  amortizationMonths: v.number(),
  paymentAmount: v.number(),
  paymentFrequency: v.union(
    v.literal("monthly"),
    v.literal("bi_weekly"),
    v.literal("accelerated_bi_weekly"),
    v.literal("weekly")
  ),
  loanType: v.union(v.literal("conventional"), v.literal("insured"), v.literal("high_ratio")),
  lienPosition: v.number(),
  annualServicingRate: v.optional(v.number()),
  interestAdjustmentDate: v.string(),
  termStartDate: v.string(),
  maturityDate: v.string(),       // ISO date string, NOT timestamp
  firstPaymentDate: v.string(),   // ISO date string, NOT timestamp
  brokerOfRecordId: v.id("brokers"),
  assignedBrokerId: v.optional(v.id("brokers")),
  priorMortgageId: v.optional(v.id("mortgages")),
  isRenewal: v.optional(v.boolean()),
  fundedAt: v.optional(v.number()),
  createdAt: v.number(),
})
```

### mortgageBorrowers table (lines 473-484)
```typescript
mortgageBorrowers: defineTable({
  mortgageId: v.id("mortgages"),
  borrowerId: v.id("borrowers"),
  role: v.union(
    v.literal("primary"),
    v.literal("co_borrower"),
    v.literal("guarantor")
  ),
  addedAt: v.number(),
})
  .index("by_mortgage", ["mortgageId"])
  .index("by_borrower", ["borrowerId"]),
```

## Implementation Plan (from Notion)

### Step 2: Implement `generateObligations` mutation

**File:** `convex/payments/obligations/generate.ts`
**Action:** Create file

- Import: `internalMutation` from `../../_generated/server`, `v` from `convex/values`, `ConvexError` from `convex/values`
- Define `PERIODS_PER_YEAR` mapping: `{ monthly: 12, bi_weekly: 26, accelerated_bi_weekly: 26, weekly: 52 }`
- Define `GRACE_PERIOD_DAYS = 15` constant
- Export `generateObligations = internalMutation({...})`:
  - Args: `{ mortgageId: v.id("mortgages") }`
  - Handler logic:
    1. Load mortgage: `ctx.db.get(args.mortgageId)` — throw if not found
    2. **Idempotency check**: Query `obligations` by `by_mortgage` index for this `mortgageId`. If count > 0, return `{ generated: 0, obligations: [], skipped: true }`
    3. **Resolve borrower**: Query `mortgageBorrowers` table for `mortgageId` — take first result's `borrowerId`. Throw if no borrower found.
    4. Parse dates: `const firstPayment = new Date(mortgage.firstPaymentDate).getTime()`, `const maturity = new Date(mortgage.maturityDate).getTime()`
    5. Calculate period amount: `Math.round((mortgage.interestRate * mortgage.principal) / periodsPerYear)` in cents
    6. Loop from `firstPayment` to `maturity`, advancing by frequency:
      - Monthly: use Date object, `date.setMonth(date.getMonth() + 1)` — MUST clamp to end-of-month (see gotchas)
      - Bi-weekly/accelerated_bi_weekly: `+= 14 * 86400000`
      - Weekly: `+= 7 * 86400000`
    7. For each period, insert obligation with all required fields
    8. Post-insert patch to set `machineContext.obligationId` to actual ID
    9. Return `{ generated: obligations.length, obligations }`

### Step 3: Implement obligation queries

**File:** `convex/payments/obligations/queries.ts`
**Action:** Create file

- Export `getObligationsByMortgage` — `internalQuery`, args: `{ mortgageId, status? }`, uses `by_mortgage` index
- Export `getUpcomingDue` — `internalQuery`, args: `{ asOf: number }`, uses `by_due_date` index, filters `status === "upcoming"` and `dueDate <= asOf`
- Export `getDuePastGrace` — `internalQuery`, args: `{ asOf: number }`, uses `by_status` index with `status === "due"`, filters `gracePeriodEnd <= asOf`
- Export `getOverdue` — `internalQuery`, args: `{ mortgageId }`, uses `by_mortgage` index, filters `status === "overdue"`
- Export `getLateFeeForObligation` — `internalQuery`, args: `{ sourceObligationId }`, scans obligations where `sourceObligationId` matches and `type === "late_fee"`
- All queries should use proper Convex query patterns with index-backed `.withIndex()` calls

## Drift Report — CRITICAL

1. **Field name mismatch**: Spec says `principalBalance` → schema has `principal`. Use `mortgage.principal`.
2. **Field name mismatch**: Spec says `termEndDate` → schema has `maturityDate`. Use `mortgage.maturityDate`.
3. **Date type mismatch**: Spec treats dates as numbers. Schema stores as **strings** (ISO format). Must parse with `new Date(dateString).getTime()`.
4. **Missing `borrowerId`**: Spec doesn't populate it. Schema **requires** `v.id("borrowers")`. Resolve from `mortgageBorrowers` join table.
5. **Missing `paymentNumber`**: Spec doesn't mention it. Schema **requires** `v.number()`. Set as sequential 1-indexed counter.
6. **`accelerated_bi_weekly`**: Not in spec but in schema. Handle same as `bi_weekly` (26 periods/year, 14-day intervals).
7. **`settledAt`**: In schema but not in spec. Set as `undefined` (optional field, not set at generation time).

## Gotchas

- **Month advancement edge case**: `new Date("2026-01-31").setMonth(1)` gives March 3rd, not Feb 28th. Use a robust month-advancement function that clamps to end-of-month.
- **Cent precision**: All amounts in cents (integers). Use `Math.round()` after division.
- **`mortgageBorrowers` join table**: If no borrower is linked, generation must fail loudly with `ConvexError`.
- **No `any` types**: Use proper types from the generated data model.
- **`accelerated_bi_weekly`**: Same period count as `bi_weekly` (26/year) but the amount should be half of monthly. The `paymentAmount` field on the mortgage handles this — consider logging a warning if calculated diverges from `mortgage.paymentAmount` by > 1 cent.

## Existing Code to Be Aware Of

**`convex/obligations/queries.ts`** already exists OUTSIDE the payments directory with 3 queries: `getSettledBeforeDate`, `getFirstAfterDate`, `getFirstOnOrAfterDate`. The NEW queries go in `convex/payments/obligations/queries.ts` (different directory).

## Downstream Contract (ENG-66 expects these)

1. `generateObligations(mortgageId)` — `internalMutation({ args: { mortgageId: v.id("mortgages") }, returns: v.object({ generated: v.number(), obligations: v.array(v.id("obligations")), skipped: v.optional(v.boolean()) }) })`
2. Query functions: `getObligationsByMortgage`, `getUpcomingDue`, `getDuePastGrace`, `getOverdue`, `getLateFeeForObligation`

## Import Patterns (follow existing codebase)

```typescript
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
```
