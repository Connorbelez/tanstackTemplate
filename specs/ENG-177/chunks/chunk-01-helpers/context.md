# Chunk 1 Context: Test Helpers & Infrastructure

## What You're Building
Reusable assertion helpers for E2E cash ledger tests and a new `createDueObligation` test factory.

## File: `convex/payments/cashLedger/__tests__/e2eHelpers.ts` (NEW)

### Function Signatures

```typescript
import type { TestHarness } from "./testUtils";
import type { Id } from "../../../_generated/dataModel";

// T-001: Assert settled amount = SUM(dispersal amounts) + servicing fee
// Uses getPostingGroupSummary to load all entries in the allocation posting group.
// Sum LENDER_PAYABLE_CREATED amounts + SERVICING_FEE_RECOGNIZED amount === obligation.amount
// All arithmetic in BigInt.
export async function assertObligationConservation(
  t: TestHarness,
  args: {
    obligationId: Id<"obligations">;
    postingGroupId: string;
  }
): Promise<void>

// T-002: Assert CONTROL:ALLOCATION balance is zero
// Uses getPostingGroupSummary + isPostingGroupComplete from postingGroups.ts
export async function assertPostingGroupComplete(
  t: TestHarness,
  postingGroupId: string
): Promise<void>

// T-003: Assert all cash_ledger_accounts for a mortgage have non-negative cumulative fields
export async function assertAccountIntegrity(
  t: TestHarness,
  mortgageId: Id<"mortgages">
): Promise<void>

// T-004: Assert journal-derived settled amount matches obligation.amountSettled
// Uses getJournalSettledAmountForObligation from reconciliation.ts
export async function assertSettlementReconciles(
  t: TestHarness,
  obligationId: Id<"obligations">
): Promise<void>

// T-005: Orchestrator that runs all 4 checks
export async function assertFullConservation(
  t: TestHarness,
  args: {
    obligationId: Id<"obligations">;
    mortgageId: Id<"mortgages">;
    allocationPostingGroupId: string;
  }
): Promise<void>
```

## Key APIs to Use

### From `postingGroups.ts`:
```typescript
export async function getPostingGroupSummary(ctx: QueryCtx, postingGroupId: string): Promise<PostingGroupValidationResult>
export function isPostingGroupComplete(result: PostingGroupValidationResult): boolean

interface PostingGroupValidationResult {
  postingGroupId: string;
  controlAllocationBalance: bigint;
  entries: Array<{ entryType: CashEntryType; amount: bigint; side: "debit" | "credit" }>;
  hasCorruptEntries: boolean;
  totalJournalEntryCount: number;
}
```

### From `reconciliation.ts`:
```typescript
export async function getJournalSettledAmountForObligation(ctx: QueryCtx, obligationId: Id<"obligations">): Promise<bigint>
```

### From `accounts.ts`:
```typescript
export function getCashAccountBalance(account): bigint
// For credit-normal families (LENDER_PAYABLE, SERVICING_REVENUE, CONTROL, etc): credits - debits
// For debit-normal families (BORROWER_RECEIVABLE, TRUST_CASH, etc): debits - credits
```

## File: `convex/payments/cashLedger/__tests__/testUtils.ts` (MODIFY)

### T-006: Add createDueObligation

```typescript
// Creates an obligation in "due" state — no pre-created accounts.
// The E2E test pipeline will create accounts as it goes (via integration functions).
export async function createDueObligation(
  t: TestHarness,
  args: {
    mortgageId: Id<"mortgages">;
    borrowerId: Id<"borrowers">;
    amount: number;
    paymentNumber?: number;
  }
): Promise<Id<"obligations">>
```

Pattern from existing `createSettledObligation`:
```typescript
const obligationId = await ctx.db.insert("obligations", {
  status: "settled",  // <-- change to "due"
  machineContext: {},
  lastTransitionAt: Date.now(),
  mortgageId: args.mortgageId,
  borrowerId: args.borrowerId,
  paymentNumber: 1,
  type: "regular_interest",
  amount: args.amount,
  amountSettled: args.amount,  // <-- change to 0 for due
  dueDate: Date.parse("2026-03-01T00:00:00Z"),
  gracePeriodEnd: Date.parse("2026-03-16T00:00:00Z"),
  settledAt: Date.parse("2026-03-01T00:00:00Z"),  // <-- remove for due
  createdAt: Date.now(),
});
```

The key differences from `createSettledObligation`:
1. `status: "due"` not `"settled"`
2. `amountSettled: 0` not `args.amount`
3. No `settledAt` field
4. No pre-created BORROWER_RECEIVABLE or CONTROL:ALLOCATION accounts
5. Accept optional `paymentNumber` (default 1)

## Constraints
- All monetary assertions use BigInt — no Number comparisons
- Use `expect()` from vitest for assertions
- Helpers run inside `t.run(async (ctx) => ...)` to access database
- Import from relative paths within the cashLedger module
