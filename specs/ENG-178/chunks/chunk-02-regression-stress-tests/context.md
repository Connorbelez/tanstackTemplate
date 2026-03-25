# Chunk 02 Context: Regression Verification + Financial Invariant Stress Tests

## Linear Issue
**ENG-178: Cross-cutting: Chaos tests and regression verification**
- All existing test suites pass without modification (except bug fix tests)
- No changes to `convex/ledger/*` types or functions — HARD CONSTRAINT
- REQ-244: Money ledger must not weaken ownership ledger guarantees

## Target Files
1. **Create:** `convex/payments/cashLedger/__tests__/regressionVerification.test.ts`
2. **Create:** `convex/payments/cashLedger/__tests__/financialInvariantStress.test.ts`

## REQ-244 Acceptance Criteria (verbatim)
> Given the cash ledger is fully implemented, when ownership ledger tests are run, then all existing tests pass unchanged. Cash ledger tables use the cash_ledger_ prefix and share no tables with ledger_. The postEntry function in convex/ledger/ is not modified. No new account types or entry types are added to the ownership ledger's type definitions.

## Regression Verification Approach
Use `execFileSync` from `node:child_process` (NOT exec — shell-safe):
```typescript
import { execFileSync } from "node:child_process";

// Safe: execFileSync takes args as array, no shell injection risk
const output = execFileSync("git", ["diff", "--name-only", "main", "--", "convex/ledger/"], {
  encoding: "utf-8",
  cwd: process.cwd(),
});
```

## Existing Financial Invariant Tests (financialInvariants.test.ts)
The existing file already covers:
- **Invariant 1:** CONTROL:ALLOCATION net-zero per posting group (3 tests)
- **Invariant 2:** Non-negative LENDER_PAYABLE (2 tests — rejection + REVERSAL exemption)
- **Invariant 3:** Point-in-time reconstruction (replayed balance matches running)

The NEW stress test file extends these with **edge cases**:
- Conservation through reversal + re-collection cycles
- CONTROL:ALLOCATION with partial reversals
- Negative LENDER_PAYABLE enforcement boundary (normal vs REVERSAL)
- High-volume point-in-time reconstruction (50+ entries)
- Idempotent replay invariance

## Key Test Patterns (from existing tests)

### Test Harness
```typescript
import { convexTest } from "convex-test";
import schema from "../../../schema";

export function createHarness(modules: Record<string, () => Promise<unknown>>) {
  process.env.DISABLE_CASH_LEDGER_HASHCHAIN = "true";
  return convexTest(schema, modules);
}

const modules = import.meta.glob("/convex/**/*.ts");
```

### Entity Seeding
```typescript
const { borrowerId, lenderAId, lenderBId, mortgageId } = await seedMinimalEntities(t);
const obligationId = await createDueObligation(t, { mortgageId, borrowerId, amount: 100_000 });
```

### Posting Entries
```typescript
// Integration-level (creates accounts automatically):
await postObligationAccrued(ctx, { obligationId, source: SYSTEM_SOURCE });
await postCashReceiptForObligation(ctx, { obligationId, amount, idempotencyKey, source });

// Low-level (requires pre-created accounts):
await postTestEntry(t, {
  entryType: "LENDER_PAYABLE_CREATED",
  effectiveDate: "2026-03-01",
  amount: 30_000,
  debitAccountId: controlAccount._id,
  creditAccountId: lenderPayable._id,
  idempotencyKey: "...",
  postingGroupId: "allocation:...",
  source: SYSTEM_SOURCE,
});
```

### REVERSAL Entries
```typescript
// REVERSAL requires causedBy (reference to original entry)
// REVERSAL skips balance checks — can make LENDER_PAYABLE negative (clawback)
await postTestEntry(t, {
  entryType: "REVERSAL",
  effectiveDate: "2026-03-01",
  amount: 20_000,
  debitAccountId: lenderPayable._id,
  creditAccountId: trustCash._id,
  idempotencyKey: "reversal-...",
  causedBy: originalEntry._id,
  source: SYSTEM_SOURCE,
});
```

### Account Balance Verification
```typescript
const balance = getCashAccountBalance(account);
expect(balance).toBe(50_000n);  // BigInt
```

### Reconciliation Functions
```typescript
const journalSettled = await getJournalSettledAmountForObligation(ctx, obligationId);
const result = await reconcileObligationSettlementProjectionInternal(ctx, obligationId);
```

## Account Family Reference
| Family | Normal Side | Purpose |
|--------|------------|---------|
| BORROWER_RECEIVABLE | Debit | What borrower owes |
| TRUST_CASH | Debit | Cash held in trust |
| CASH_CLEARING | Debit | Pending bank confirmations |
| UNAPPLIED_CASH | Credit | Received but unmatched |
| LENDER_PAYABLE | Credit | Owed to lenders |
| SERVICING_REVENUE | Credit | Fee income |
| CONTROL | Varies | Transient — nets to zero per posting group |
| WRITE_OFF | Debit | Loss recognition |
| SUSPENSE | Credit | Unresolvable items |

## Constraints
- No floating-point arithmetic — all amounts are integer cents, assertions use BigInt
- Each test uses its own `createHarness(modules)` for isolation
- REVERSAL and CORRECTION entry types skip balance checks
- All other entry types enforce non-negative balance on credit account
- BORROWER_RECEIVABLE and CONTROL are exempt from negative balance checks
