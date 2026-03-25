# Chunk 1 Context: Suite Types and Check Functions

## Goal
Create `convex/payments/cashLedger/reconciliationSuite.ts` with typed result interfaces and 8 reconciliation check functions. Each check returns a `ReconciliationCheckResult<T>` with `checkName`, `isHealthy`, `items`, `count`, `totalAmountCents`, and `checkedAt`.

## File to Create
`convex/payments/cashLedger/reconciliationSuite.ts`

## Data Structures (from Implementation Plan)

```typescript
export interface ReconciliationCheckResult<T> {
  checkName: string;
  isHealthy: boolean;
  items: T[];
  count: number;
  totalAmountCents: number;
  checkedAt: number;
}

export interface UnappliedCashItem {
  accountId: Id<"cash_ledger_accounts">;
  mortgageId?: Id<"mortgages">;
  balance: number; // cents
  ageDays: number;
}

export interface NegativePayableItem {
  accountId: Id<"cash_ledger_accounts">;
  lenderId?: Id<"lenders">;
  mortgageId?: Id<"mortgages">;
  balance: number; // negative cents
}

export interface ObligationDriftItem {
  obligationId: Id<"obligations">;
  journalDerivedAmount: number;
  recordedAmount: number;
  driftCents: number;
}

export interface ControlNetZeroItem {
  postingGroupId: string;
  controlAllocationBalance: number;
  entryCount: number;
  obligationId?: Id<"obligations">;
}

export interface SuspenseItem {
  accountId: Id<"cash_ledger_accounts">;
  mortgageId?: Id<"mortgages">;
  balance: number;
  ageDays: number;
  metadata?: Record<string, unknown>;
}

export interface OrphanedObligationItem {
  obligationId: Id<"obligations">;
  status: string;
  amount: number;
  dueDate: number;
}

export interface StuckCollectionItem {
  attemptId: Id<"collectionAttempts">;
  planEntryId: Id<"collectionPlanEntries">;
  ageDays: number;
  amount: number;
}

export interface OrphanedUnappliedItem {
  accountId: Id<"cash_ledger_accounts">;
  mortgageId?: Id<"mortgages">;
  balance: number;
  ageDays: number;
}
```

## Existing Code to Reuse

### accounts.ts — Balance computation
```typescript
import { getCashAccountBalance, safeBigintToNumber } from "./accounts";
```
- `getCashAccountBalance(account)` returns bigint — debit-normal or credit-normal based on family
- `safeBigintToNumber(value)` converts bigint to number, throws on precision loss
- LENDER_PAYABLE is credit-normal (credits > debits = positive balance)
- BORROWER_RECEIVABLE is debit-normal
- UNAPPLIED_CASH is credit-normal
- SUSPENSE accounts: balance = credits - debits (credit-normal)

### reconciliation.ts — Existing checks to reuse
```typescript
import {
  getJournalSettledAmountForObligation,
  reconcileObligationSettlementProjectionInternal,
  findNonZeroPostingGroups,
} from "./reconciliation";
```
- `reconcileObligationSettlementProjectionInternal(ctx, obligationId)` returns `{ obligationId, projectedSettledAmount, journalSettledAmount, driftAmount, hasDrift }`
- `findNonZeroPostingGroups(ctx)` returns `{ alerts: PostingGroupReconciliationAlert[], orphaned: OrphanedAllocationAlert[] }` — already implemented for Check 4 (CONTROL net-zero)
- `getJournalSettledAmountForObligation(ctx, obligationId)` — sums CASH_RECEIVED minus REVERSAL of CASH_RECEIVED entries

### types.ts
```typescript
import type { CashAccountFamily } from "./types";
```

## Schema Indexes Available

### cash_ledger_accounts
- `by_family` → `["family"]` — for querying UNAPPLIED_CASH, LENDER_PAYABLE, SUSPENSE accounts
- `by_family_and_obligation` → `["family", "obligationId"]`
- `by_family_and_mortgage` → `["family", "mortgageId"]`
- `by_family_and_lender` → `["family", "lenderId"]`
- `by_family_and_subaccount` → `["family", "subaccount"]`

### cash_ledger_journal_entries
- `by_obligation_and_sequence` → `["obligationId", "sequenceNumber"]`
- `by_posting_group` → `["postingGroupId", "sequenceNumber"]`
- `by_effective_date` → `["effectiveDate", "sequenceNumber"]`

### obligations
- `by_status` → `["status"]` — for querying settled obligations
- `by_mortgage` → `["mortgageId", "status"]`

### collectionAttempts
- `by_status` → `["status"]` — for querying `executing` attempts
- Schema: `{ status, planEntryId, method, amount, initiatedAt, settledAt, failedAt, failureReason }`

## Implementation Details per Check

### T-002: checkUnappliedCash
- Query `cash_ledger_accounts` with `by_family` index, family = "UNAPPLIED_CASH"
- Filter: `getCashAccountBalance(account) > 0n`
- Aging: `Math.floor((Date.now() - account._creationTime) / (1000 * 60 * 60 * 24))`
- Convert balances via `safeBigintToNumber`

### T-003: checkNegativePayables
- Query `cash_ledger_accounts` with `by_family` index, family = "LENDER_PAYABLE"
- LENDER_PAYABLE is credit-normal, so negative balance = debits > credits = `getCashAccountBalance(account) < 0n`
- Alert condition: any account with negative balance (except during active reversal — for now just flag all since we have no reversal state yet)

### T-004: checkObligationBalanceDrift
- Query obligations with `by_status` index, status = "settled"
- For each, call `reconcileObligationSettlementProjectionInternal(ctx, obligationId)`
- Filter where `hasDrift === true`
- **Performance note**: This scans all settled obligations. Consider limiting to recent 30 days for cron, full scan for on-demand query.

### T-005: checkControlNetZero
- Call `findNonZeroPostingGroups(ctx)` from `reconciliation.ts`
- Wrap results into `ReconciliationCheckResult<ControlNetZeroItem>`

### T-006: checkSuspenseItems
- Query `cash_ledger_accounts` with `by_family` index, family = "SUSPENSE"
- Filter: `getCashAccountBalance(account) > 0n`  (SUSPENSE is not in CREDIT_NORMAL_FAMILIES, so balance = debits - credits)
- Wait — check: SUSPENSE is NOT in CREDIT_NORMAL_FAMILIES in types.ts, so it's debit-normal. Balance = debits - credits.
- Aging: same formula as unapplied cash

### T-007: checkOrphanedObligations
- Query obligations that are past "due" (status != "generated" or "pending")
- For each, check if there's an OBLIGATION_ACCRUED journal entry by querying `cash_ledger_journal_entries` with `by_obligation_and_sequence` index
- Filter entries where `entryType === "OBLIGATION_ACCRUED"`
- Obligations without any OBLIGATION_ACCRUED entry are orphaned

### T-008: checkStuckCollections
- Query `collectionAttempts` with `by_status` index, status = "executing"
- Filter: `Date.now() - attempt.initiatedAt > 7 * 24 * 60 * 60 * 1000`
- The collectionAttempts table does NOT have a direct `mortgageId` field. Don't try to include it.

### T-009: checkOrphanedUnappliedCash
- Same query as checkUnappliedCash but with additional age filter: `ageDays > 7`
- This is a subset of check 1 with a stricter condition

## Function Signatures
All check functions take `(ctx: QueryCtx)` and return `Promise<ReconciliationCheckResult<T>>`.

```typescript
export async function checkUnappliedCash(ctx: QueryCtx): Promise<ReconciliationCheckResult<UnappliedCashItem>>
export async function checkNegativePayables(ctx: QueryCtx): Promise<ReconciliationCheckResult<NegativePayableItem>>
export async function checkObligationBalanceDrift(ctx: QueryCtx): Promise<ReconciliationCheckResult<ObligationDriftItem>>
export async function checkControlNetZero(ctx: QueryCtx): Promise<ReconciliationCheckResult<ControlNetZeroItem>>
export async function checkSuspenseItems(ctx: QueryCtx): Promise<ReconciliationCheckResult<SuspenseItem>>
export async function checkOrphanedObligations(ctx: QueryCtx): Promise<ReconciliationCheckResult<OrphanedObligationItem>>
export async function checkStuckCollections(ctx: QueryCtx): Promise<ReconciliationCheckResult<StuckCollectionItem>>
export async function checkOrphanedUnappliedCash(ctx: QueryCtx): Promise<ReconciliationCheckResult<OrphanedUnappliedItem>>
```

## Constraints
- No `any` types — use the defined result interfaces
- All monetary amounts as `number` (cents) in result types — use `safeBigintToNumber` to convert from bigint
- `_creationTime` is available on all Convex documents (auto-populated by Convex)
- Import `QueryCtx` from `../../_generated/server`
- Import `Id` from `../../_generated/dataModel`
- After completing, run `bun typecheck` to verify
