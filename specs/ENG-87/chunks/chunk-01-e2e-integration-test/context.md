# ENG-87 Chunk Context — E2E Integration Test

## Source Documents

- **Linear Issue**: ENG-87 — E2E integration tests: seed → accrue → settle → disperse
- **Implementation Plan** (Notion): `329fc1b4402481bfa4dcefc64cbf4055`
- **Dispersal Accounting** (Notion): `323fc1b4402481409b9b71e7ffd9060`
- **Interest Accrual Computation Engine** (Notion): `323fc1b4402481938978e3c68cb722e8`
- **Loan Servicing Happy Path** (Notion): `30ffc1b44024808782d2cdc586640ae3`
- **UC: System creates dispersal entries** (Notion): `323fc1b4402481f98f66e154692077fd`
- **UC: System reconciles accrued vs dispersed** (Notion): `327fc1b440248184b2a9cc8bc40d9b45`

## Blocking Issues (all DONE ✅)

- **ENG-71** (`calculateAccruedInterest` query) — provides `calculateAccruedInterest` query with Actual/365 math
- **ENG-82** (`createDispersalEntries` mutation) — `internalMutation` that writes dispersal + servicing fee entries atomically
- **ENG-83** (reconciliation queries) — `getUndisbursedBalance`, `getDisbursementHistory`, `getDispersalsByObligation`
- **ENG-84** (Wire GT effect OBLIGATION_SETTLED → createDispersalEntries) — GT effect is wired; in tests, call `createDispersalEntries` directly

## Project Constants

```typescript
// From convex/constants.ts
export const FAIRLEND_STAFF_ORG_ID = "org_01KKF56VABM4NYFFSR039RTJBM";
```

## Query FunctionReferences (from accrual.integration.test.ts)

```typescript
const SINGLE_LENDER_QUERY = makeFunctionReference<
  "query",
  AccruedInterestQueryArgs,
  AccruedInterestQueryResult
>("accrual/calculateAccruedInterest:calculateAccruedInterest");
```

### AccruedInterestQueryArgs
```typescript
interface AccruedInterestQueryArgs {
  fromDate: string;        // YYYY-MM-DD
  lenderId: string;        // lender authId (string)
  mortgageId: Id<"mortgages">;
  toDate: string;          // YYYY-MM-DD
}
```

### AccruedInterestQueryResult
```typescript
interface AccruedInterestQueryResult {
  accruedInterest: number;   // in cents (floating point until rounding)
  fromDate: string;
  lenderId: string;
  mortgageId: string;
  periods: Array<{
    fraction: number;
    fromDate: string;
    toDate: string;
  }>;
  toDate: string;
}
```

## createDispersalEntries (from createDispersalEntries.test.ts)

```typescript
// Handler type:
interface CreateDispersalEntriesHandler {
  _handler: (
    ctx: MutationCtx,
    args: {
      obligationId: Id<"obligations">;
      mortgageId: Id<"mortgages">;
      settledAmount: number;      // in CENTS
      settledDate: string;         // YYYY-MM-DD
      idempotencyKey: string;
      source: { type: "system"; channel: "test" };
    }
  ) => Promise<{
    created: boolean;
    entries: Array<{
      id: Id<"dispersalEntries">;
      lenderId: Id<"lenders">;
      lenderAccountId: Id<"ledger_accounts">;
      amount: number;             // ROUNDED to cents
      rawAmount: number;           // full precision before rounding
      units: number;
    }>;
    servicingFeeEntryId: Id<"servicingFeeEntries"> | null;
  }>;
}

// Usage in tests:
const result = await t.run(async (ctx) =>
  createDispersalEntriesMutation._handler(ctx, {
    obligationId,
    mortgageId,
    settledAmount: 83_333,         // $833.33 in cents
    settledDate: "2026-01-31",
    idempotencyKey: "test:obligation-1",
    source: { type: "system", channel: "test" },
  })
);
```

## Reconciliation Query Signatures

### getUndisbursedBalance (public, ledgerQuery)
```typescript
// Input:
{ lenderId: Id<"lenders"> }

// Returns:
{
  lenderId: Id<"lenders">;
  undisbursedBalance: number;  // sum of all pending entry amounts in cents
  entryCount: number;
}
```

### getDisbursementHistory (public, ledgerQuery)
```typescript
// Input:
{
  lenderId: Id<"lenders">;
  fromDate?: string;  // YYYY-MM-DD
  toDate?: string;    // YYYY-MM-DD
}

// Returns:
{
  lenderId: Id<"lenders">;
  entries: Array<{
    id: Id<"dispersalEntries">;
    mortgageId: Id<"mortgages">;
    obligationId: Id<"obligations">;
    amount: number;
    dispersalDate: string;
    status: "pending" | "disbursed" | "failed";
    calculationDetails: CalculationDetails;
  }>;
  total: number;  // sum of entry amounts
}
```

### getDispersalsByObligation (public, ledgerQuery)
```typescript
// Input:
{ obligationId: Id<"obligations"> }

// Returns:
{
  obligationId: Id<"obligations">;
  total: number;
  entries: Array<{
    id: Id<"dispersalEntries">;
    mortgageId: Id<"mortgages">;
    lenderId: Id<"lenders">;
    lenderAccountId: Id<"ledger_accounts">;
    amount: number;
    dispersalDate: string;
    status: string;
    calculationDetails: CalculationDetails;
  }>;
}
```

## Schema Field Names (confirmed by drift report)

| Field | Correct Name | Incorrect Name |
|-------|-------------|---------------|
| Interest rate | `interestRate` | `annualRate` |
| Principal | `principal` | `principalBalance` |
| Servicing rate | `annualServicingRate` | (default 0.01) |

## Mint + Issue Pattern (from accrual.integration.test.ts)

```typescript
// 1. Initialize sequence counter
await asAdmin(t).mutation(api.ledger.sequenceCounter.initializeSequenceCounter, {});

// 2. Mint mortgage (creates the MORTGAGE_MINTED entry)
await asAdmin(t).mutation(api.ledger.mutations.mintMortgage, {
  mortgageId: mortgageId,
  effectiveDate: "2026-01-01",
  idempotencyKey: `mint-${mortgageId}`,
  source: SYS_SOURCE,
});

// 3. Issue shares to lender (creates SHARES_ISSUED entry)
await asAdmin(t).mutation(internal.ledger.mutations.issueShares, {
  mortgageId,
  lenderId: "lender-a",     // string authId
  amount: 6000,             // units (not cents — 60% of 10000)
  effectiveDate: "2026-01-01",
  idempotencyKey: `issue-${mortgageId}-lender-a`,
  source: SYS_SOURCE,
});
```

## Transfer Pattern (for Test 2 deal-close proration)

```typescript
await asAdmin(t).mutation(api.ledger.mutations.transferShares, {
  mortgageId: mortgageId,
  sellerLenderId: "lender-a",
  buyerLenderId: "lender-b",
  amount: 5000,             // units transferred (50% of 10000)
  effectiveDate: "2026-01-15",
  idempotencyKey: "transfer-deal-close",
  source: SYS_SOURCE,
});
```

**Important**: Closing date accrues to the **seller**; buyer's accrual starts **day after** closing. This is derived from the ownership period construction.

## Test Data (all amounts in CENTS internally)

### Test 1 values (confirmed by implementation plan)
- Principal: 10_000_000 ($100,000)
- Interest rate: 0.10 (10%)
- Annual servicing rate: 0.01 (1%)
- Monthly servicing fee: `(0.01 × 10_000_000) / 12` = 8_333 cents = $83.33
- 30-day accrual period: Jan 1–31, 2026 (31 days inclusive)
- A's accrual: `(0.10 × 0.60 × 10_000_000 × 31) / 365` = 49_315 cents ≈ $493.15
- B's accrual: `(0.10 × 0.40 × 10_000_000 × 31) / 365` = 32_877 cents ≈ $328.77
- Total accrual: 82_192 cents
- Settlement amount: 83_333 cents ($833.33)
- After servicing fee: 83_333 - 8_333 = 75_000
- A's dispersal: 75_000 × 0.60 = 45_000 cents = $450.00
- B's dispersal: 75_000 × 0.40 = 30_000 cents = $300.00

### Days are inclusive
- `daysBetween("2026-01-01", "2026-01-31")` = 31 (confirmed by interestMath.test.ts and proration.test.ts)
- `daysBetween("2026-01-15", "2026-01-31")` = 17

## Test Harness Pattern (from createDispersalEntries.test.ts)

```typescript
const modules = import.meta.glob("/convex/**/*.ts");
const t = convexTest(schema, modules);

function createHarness() {
  return convexTest(schema, modules);
}

async function seedDispersalScenario(t, options) {
  return t.run(async (ctx) => {
    // Insert users, lenders, brokers, borrowers, property, mortgage, obligation
    // Return { obligationId, mortgageId, lenderOneId, lenderTwoId, lenderAccountIds }
  });
}
```

## Admin and Lender Identity Pattern (from accrual.integration.test.ts)

```typescript
const ADMIN_IDENTITY = {
  subject: "integration-admin",
  issuer: "https://api.workos.com",
  org_id: FAIRLEND_STAFF_ORG_ID,
  organization_name: "FairLend Staff",
  role: "admin",
  roles: JSON.stringify(["admin"]),
  permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
  user_email: "integration-admin@fairlend.ca",
  user_first_name: "Integration",
  user_last_name: "Admin",
};

function lenderIdentity(subject: string) {
  return {
    subject,
    issuer: "https://api.workos.com",
    permissions: JSON.stringify(["ledger:view"]),
    user_email: `${subject}@fairlend.test`,
    user_first_name: "Accrual",
    user_last_name: "Tester",
  };
}

function asAdmin(t) {
  return t.withIdentity(ADMIN_IDENTITY);
}

function asLender(t, lenderId: string) {
  return t.withIdentity(lenderIdentity(lenderId));
}
```

## Seed Mortgage Args (from accrual.integration.test.ts + createDispersalEntries.test.ts)

```typescript
await ctx.db.insert("mortgages", {
  status: "active",
  machineContext: { missedPayments: 0, lastPaymentAt: 0 },
  lastTransitionAt: createdAt,
  propertyId,
  principal: 10_000_000,           // $100K in cents
  interestRate: 0.10,               // 10%
  annualServicingRate: 0.01,       // 1%
  rateType: "fixed",
  termMonths: 12,
  amortizationMonths: 12,
  paymentAmount: 100_000,          // monthly payment in cents
  paymentFrequency: "monthly",
  loanType: "conventional",
  lienPosition: 1,
  interestAdjustmentDate: "2026-01-01",
  termStartDate: "2026-01-01",
  maturityDate: "2026-12-31",
  firstPaymentDate: "2026-02-01",
  brokerOfRecordId: brokerId,
  createdAt,
});
```

## Obligation Seeding Pattern

```typescript
await ctx.db.insert("obligations", {
  status: "settled",
  mortgageId,
  borrowerId,
  paymentNumber: 1,
  type: "regular_interest",
  amount: 100_000,           // cents
  amountSettled: 100_000,   // cumulative settled
  dueDate: Date.parse(`${settledDate}T00:00:00Z`),
  gracePeriodEnd: Date.parse(`${settledDate}T00:00:00Z`),
  settledAt: Date.parse(`${settledDate}T00:00:00Z`),
  createdAt: now,
});
```

## DispersalEntries Table Schema (from schema.ts)

```typescript
dispersalEntries: defineTable({
  mortgageId: v.id("mortgages"),
  lenderId: v.id("lenders"),
  lenderAccountId: v.id("ledger_accounts"),
  amount: v.number(),           // in cents
  dispersalDate: v.string(),   // YYYY-MM-DD
  obligationId: v.id("obligations"),
  servicingFeeDeducted: v.number(),
  status: dispersalStatusValidator,  // "pending" | "disbursed" | "failed"
  idempotencyKey: v.string(),
  calculationDetails: calculationDetailsValidator,
  createdAt: v.number(),
})
  .index("by_lender", ["lenderId", "dispersalDate"])
  .index("by_mortgage", ["mortgageId", "dispersalDate"])
  .index("by_obligation", ["obligationId"])
  .index("by_status", ["status", "lenderId"])
  .index("by_idempotency", ["idempotencyKey"])
```

## CalculationDetails shape (from createDispersalEntries.ts)

```typescript
interface CalculationDetails {
  ownershipUnits: number;      // lender's units at time of dispersal
  totalUnits: number;         // total mortgage units
  ownershipFraction: number;   // units / totalUnits
  rawAmount: number;          // full precision before rounding
  settledAmount: number;      // total obligation amount
  servicingFee: number;       // fee deducted
  distributableAmount: number; // after fee deduction
}
```

## ServicingFeeEntries Table Schema (from schema.ts)

```typescript
servicingFeeEntries: defineTable({
  mortgageId: v.id("mortgages"),
  obligationId: v.id("obligations"),
  amount: v.number(),           // in cents
  annualRate: v.number(),       // e.g. 0.01
  principalBalance: v.number(), // principal at time of fee
  date: v.string(),           // YYYY-MM-DD
})
```

## Key Implementation Notes

1. **Use `calculatePeriodAccrual`** from `../interestMath` to verify expected accrual amounts — import and use directly in assertions
2. **Assertion pattern**: `expect(result).toBeCloseTo(expectedCents, 8)` for floating-point comparisons
3. **Idempotency**: Each test should use a unique `idempotencyKey` to avoid interference
4. **Order of operations in Test 1**: Seed → Mint → Issue → Query accrual → Settle obligation → Run createDispersalEntries → Assert dispersal amounts → Assert undisbursed balances
5. **Test 3 accumulation**: Each settlement creates new dispersal entries; undisbursed balance = sum of all pending entries for a lender
