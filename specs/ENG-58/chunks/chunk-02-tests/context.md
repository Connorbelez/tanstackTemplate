# Chunk 02 Context: Tests & Validation

## Goal
Write comprehensive tests for obligation generation in `convex/payments/__tests__/generation.test.ts`, then run the full validation suite.

## Test File Location
`convex/payments/__tests__/generation.test.ts`

## Test Framework Patterns (from existing codebase)

### convex-test pattern (from ledger/__tests__/sequenceCounter.test.ts)
```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

function createTestHarness() {
  return convexTest(schema, modules);
}
```

### Identity pattern
```typescript
const LEDGER_TEST_IDENTITY = {
  subject: "test-ledger-user",
  issuer: "https://api.workos.com",
  org_id: "org_01EXAMPLE",
  organization_name: "FairLend Staff",
  role: "admin",
  roles: JSON.stringify(["admin"]),
  permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
  user_email: "test@fairlend.ca",
  user_first_name: "Test",
  user_last_name: "User",
};
```

### Direct DB access in tests
```typescript
// Use t.run() for direct DB reads/writes in tests
const doc = await t.run(async (ctx) => {
  return ctx.db.query("table_name").withIndex("index", (q) => q.eq("field", value)).unique();
});
```

## Schema Fields — obligations table
```typescript
obligations: defineTable({
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  mortgageId: v.id("mortgages"),
  borrowerId: v.id("borrowers"),
  paymentNumber: v.number(),
  type: v.union(v.literal("regular_interest"), v.literal("arrears_cure"), v.literal("late_fee"), v.literal("principal_repayment")),
  amount: v.number(),
  amountSettled: v.number(),
  dueDate: v.number(),
  gracePeriodEnd: v.number(),
  sourceObligationId: v.optional(v.id("obligations")),
  settledAt: v.optional(v.number()),
  createdAt: v.number(),
})
```

## Schema Fields — related tables for seeding test data

### mortgages (key fields)
```typescript
{
  status: v.string(),
  propertyId: v.id("properties"),
  principal: v.number(),            // cents
  interestRate: v.number(),         // annual decimal, e.g. 0.08
  rateType: v.union(v.literal("fixed"), v.literal("variable")),
  termMonths: v.number(),
  amortizationMonths: v.number(),
  paymentAmount: v.number(),        // cents
  paymentFrequency: v.union(v.literal("monthly"), v.literal("bi_weekly"), v.literal("accelerated_bi_weekly"), v.literal("weekly")),
  loanType: v.union(v.literal("conventional"), v.literal("insured"), v.literal("high_ratio")),
  lienPosition: v.number(),
  interestAdjustmentDate: v.string(),
  termStartDate: v.string(),
  maturityDate: v.string(),         // ISO date string
  firstPaymentDate: v.string(),     // ISO date string
  brokerOfRecordId: v.id("brokers"),
  createdAt: v.number(),
}
```

### mortgageBorrowers
```typescript
{
  mortgageId: v.id("mortgages"),
  borrowerId: v.id("borrowers"),
  role: v.union(v.literal("primary"), v.literal("co_borrower"), v.literal("guarantor")),
  addedAt: v.number(),
}
```

### borrowers (need to seed)
Check schema for exact fields. At minimum: status, name fields, createdAt.

### properties (need to seed)
Check schema for exact fields. At minimum: address, createdAt.

### brokers (need to seed)
Check schema for exact fields. At minimum: name, createdAt.

## Test Cases (from Implementation Plan)

1. **Monthly mortgage**: 8% rate on $500,000 principal ($50,000,000 cents), 12-month term → 12 obligations, each `Math.round(0.08 * 50_000_000 / 12)` = 333,333 cents ($3,333.33)
2. **Bi-weekly mortgage**: Same terms, 26-week period → obligations at 14-day intervals, amount = `Math.round(0.08 * 50_000_000 / 26)` = 153,846 cents
3. **Weekly mortgage**: → 52 obligations/year, amount = `Math.round(0.08 * 50_000_000 / 52)` = 76,923 cents
4. **Grace period**: Each obligation's `gracePeriodEnd` = `dueDate + 15 * 86400000`
5. **Machine context**: Each obligation has `{ obligationId: <actual_id>, paymentsApplied: 0 }`
6. **All start as `upcoming`**: Every obligation `status === "upcoming"`
7. **Payment numbers sequential**: `paymentNumber` goes 1, 2, 3, …
8. **Idempotency**: Call `generateObligations` twice — second call returns `{ generated: 0, skipped: true }`
9. **Missing mortgage**: Throws error (ConvexError)
10. **Missing borrower**: Throws error when no mortgageBorrower entry exists

## Seeding Approach

Tests need to seed prerequisite entities using `t.run()`:
1. Insert a property
2. Insert a borrower
3. Insert a broker
4. Insert a mortgage with known terms
5. Insert a mortgageBorrower linking the mortgage to the borrower

Then call `generateObligations` via `t.mutation(internal.payments.obligations.generate.generateObligations, { mortgageId })`.

## Validation Commands
After tests pass:
- `bun check` (lint + format + auto-fix)
- `bun typecheck`
- `bunx convex codegen`
- `bun run test` (full suite)

## Important Notes
- `generateObligations` is an `internalMutation` — call via `internal.payments.obligations.generate.generateObligations`
- The queries are `internalQuery` — call via `internal.payments.obligations.queries.*`
- All amounts in cents (integers)
- Dates in schema are ISO strings for mortgages but unix timestamps for obligations
- Use `t.run()` for direct DB assertions (reading inserted obligations to verify fields)
