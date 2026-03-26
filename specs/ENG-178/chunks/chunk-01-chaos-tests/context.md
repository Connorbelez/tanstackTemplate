# Chunk 01 Context: Chaos Tests

## Linear Issue
**ENG-178: Cross-cutting: Chaos tests and regression verification**
- All chaos test scenarios must pass
- No changes to `convex/ledger/*` types or functions
- `bun run test` passes with 100% existing + new tests

## Tech Design §11.5 — Chaos Tests
The tech design specifies 5 chaos test scenarios:
1. Webhook delivered out of order (settlement before initiation)
2. Webhook delivered multiple times (idempotency verification)
3. Settlement callback fires after cancellation
4. Concurrent settlement of same obligation
5. Dispersal mutation failure after settlement (self-healing verification)

## Target File
**Create:** `convex/payments/cashLedger/__tests__/chaosTests.test.ts`

## Key Dependencies

### Test Harness Pattern (from testUtils.ts)
```typescript
import { convexTest } from "convex-test";
import schema from "../../../schema";

export function createHarness(modules: Record<string, () => Promise<unknown>>) {
  process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
  return convexTest(schema, modules);
}

export type TestHarness = ReturnType<typeof convexTest>;

// Each test file MUST declare:
const modules = import.meta.glob("/convex/**/*.ts");
// Then: const t = createHarness(modules);
```

### Entity Seeding (from testUtils.ts)
```typescript
// seedMinimalEntities creates: broker, borrower, 2 lenders (60/40 ownership split),
// property, mortgage (principal=10M, rate=8%, term=12mo, payment=100k, monthly)
// Does NOT create an obligation — tests create their own.
export async function seedMinimalEntities(t: TestHarness) {
  return t.run(async (ctx) => {
    // ... creates all entities ...
    return { borrowerId, lenderAId, lenderBId, mortgageId };
  });
}

// createDueObligation: status="due", amountSettled=0, no accounts pre-seeded
export async function createDueObligation(t, args: {
  mortgageId, borrowerId, amount, paymentNumber?
}) { ... }

// createSettledObligation: status="settled", pre-creates BORROWER_RECEIVABLE + CONTROL:ALLOCATION
export async function createSettledObligation(t, args: {
  mortgageId, borrowerId, amount
}) { ... }
```

### Posting Cash Entries (from postEntry.ts)
```typescript
export interface PostCashEntryInput {
  amount: number;                              // cents, positive safe integer
  entryType: CashEntryType;
  effectiveDate: string;                       // YYYY-MM-DD
  debitAccountId: Id<"cash_ledger_accounts">;
  creditAccountId: Id<"cash_ledger_accounts">;
  idempotencyKey: string;                      // UNIQUE — duplicate returns existing entry
  source: CommandSource;
  // optional cross-refs:
  mortgageId?, obligationId?, attemptId?, lenderId?, borrowerId?,
  dispersalEntryId?, postingGroupId?, causedBy?, reason?, metadata?
}

// IDEMPOTENCY: If an entry with the same idempotencyKey exists, returns it immediately.
// No duplicate entries are created. This is the core chaos-test target for Tests 2a and 2b.

// BALANCE CHECK: Credit account must have sufficient balance EXCEPT:
// - CONTROL and BORROWER_RECEIVABLE families are exempt (can go negative during reversals)
// - REVERSAL and CORRECTION entry types skip balance checks entirely
```

### Integration Functions (from integrations.ts)
```typescript
// Posts OBLIGATION_ACCRUED: debits BORROWER_RECEIVABLE, credits CONTROL:ACCRUAL
export async function postObligationAccrued(ctx, {
  obligationId, source
}) { ... }

// Posts CASH_RECEIVED: debits TRUST_CASH, credits BORROWER_RECEIVABLE
// Returns null if no BORROWER_RECEIVABLE account found (logs audit error)
export async function postCashReceiptForObligation(ctx, {
  obligationId, amount, idempotencyKey, effectiveDate?, attemptId?, postingGroupId?, source
}) { ... }

// Posts settlement allocation (called by createDispersalEntries internally)
export async function postSettlementAllocation(ctx, { ... }) { ... }
```

### Reconciliation (from reconciliation.ts)
```typescript
// Returns journal-derived settled amount: SUM(CASH_RECEIVED) - SUM(reversals of CASH_RECEIVED)
export async function getJournalSettledAmountForObligation(ctx, obligationId) { ... }

// Compares journal-derived vs. obligation.amountSettled field
export async function reconcileObligationSettlementProjectionInternal(ctx, obligationId) {
  return {
    obligationId,
    projectedSettledAmount,   // from obligation.amountSettled
    journalSettledAmount,     // from journal entries
    driftAmount,
    hasDrift: driftAmount !== 0n,
  };
}
```

### Account Functions (from accounts.ts)
```typescript
export function getCashAccountBalance(account: Doc<"cash_ledger_accounts">): bigint {
  // Credit-normal families: balance = credits - debits
  // Debit-normal families: balance = debits - credits
}

export async function findCashAccount(db, { family, mortgageId?, obligationId?, lenderId?, borrowerId?, subaccount? })
export async function getOrCreateCashAccount(ctx, { family, mortgageId?, obligationId?, lenderId?, borrowerId?, subaccount? })
```

### Types (from types.ts)
```typescript
export type CashAccountFamily = "BORROWER_RECEIVABLE" | "CASH_CLEARING" | "TRUST_CASH" |
  "UNAPPLIED_CASH" | "LENDER_PAYABLE" | "SERVICING_REVENUE" | "WRITE_OFF" | "SUSPENSE" | "CONTROL";

export type CashEntryType = "OBLIGATION_ACCRUED" | "CASH_RECEIVED" | "CASH_APPLIED" |
  "LENDER_PAYABLE_CREATED" | "SERVICING_FEE_RECOGNIZED" | "LENDER_PAYOUT_SENT" |
  "OBLIGATION_WAIVED" | "OBLIGATION_WRITTEN_OFF" | "REVERSAL" | "CORRECTION" |
  "SUSPENSE_ESCALATED" | "SUSPENSE_ROUTED";

export function buildIdempotencyKey(prefix: string, ...parts: string[]): string;
```

### E2E Assertion Helpers (from e2eHelpers.ts)
```typescript
// Verifies settled amount = SUM(lender payables) + servicing fee per posting group
export async function assertObligationConservation(t, { obligationId, postingGroupId }) { ... }

// Verifies all accounts for a mortgage have non-negative cumulativeDebits/Credits
export async function assertAccountIntegrity(t, { mortgageId }) { ... }

// Verifies journal-derived settled amount matches obligation.amountSettled
export async function assertSettlementReconciles(t, { obligationId }) { ... }
```

### Test Utility Helpers (from testUtils.ts)
```typescript
export const SYSTEM_SOURCE = {
  channel: "scheduler" as const,
  actorId: "system",
  actorType: "system" as const,
};

// Convenience wrapper around postCashEntryInternal
export async function postTestEntry(t: TestHarness, args: PostCashEntryInput) { ... }

// Creates a cash_ledger_account with optional initial balances
export async function createTestAccount(t, {
  family, mortgageId?, obligationId?, lenderId?, borrowerId?,
  subaccount?, initialDebitBalance?, initialCreditBalance?
}) { ... }
```

## E2E Test Patterns (from e2eLifecycle.test.ts)
The existing e2e tests follow this pattern:
1. `const t = createHarness(modules);` — one harness per test
2. `const { borrowerId, mortgageId } = await seedMinimalEntities(t);`
3. `const obligationId = await createDueObligation(t, { mortgageId, borrowerId, amount: 100_000 });`
4. Operations run inside `await t.run(async (ctx) => { ... })` blocks
5. Each `t.run` is a separate Convex transaction
6. Assertions use vitest `expect()` + custom helpers from e2eHelpers.ts

## Constraints
- No floating-point arithmetic in assertions — all amounts are integer cents
- Use `convex-test` + `vitest` (matching existing test patterns)
- Each chaos test uses its own `createHarness(modules)` (full isolation per describe block)
- The cash ledger does NOT enforce obligation status — it posts entries regardless. The GT engine handles status transitions. Chaos tests verify the ledger's behavior when receiving unexpected sequences.
- `postPaymentReversalCascade` does NOT exist yet (ENG-172). For reversal idempotency (T-004), test at the individual REVERSAL entry level using `postTestEntry` with `entryType: "REVERSAL"`.
