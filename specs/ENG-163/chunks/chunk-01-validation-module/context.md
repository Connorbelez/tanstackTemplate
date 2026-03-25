# Chunk 1 Context: Posting Group Validation Module

## Goal
Create `convex/payments/cashLedger/postingGroups.ts` — a module that validates posting group integrity, computes summaries, and determines completeness.

## Task Details

### T-001: `validatePostingGroupAmounts()`
Pure function (no database access). Validates that lender amounts + servicing fee === obligation amount.

```typescript
export function validatePostingGroupAmounts(
  obligationAmount: number,
  lenderAmounts: number[],
  servicingFee: number
): void
```

- Throws `ConvexError` with code `POSTING_GROUP_SUM_MISMATCH` if `sum(lenderAmounts) + servicingFee !== obligationAmount`
- Error includes: `obligationAmount`, `totalLenderAmount`, `servicingFee`, `actualTotal`
- Import `ConvexError` from `"convex/values"`

### T-002: `getPostingGroupSummary()`
Query helper that loads all entries for a posting group and computes the CONTROL:ALLOCATION balance.

```typescript
export interface PostingGroupValidationResult {
  postingGroupId: string;
  isComplete: boolean;
  controlAllocationBalance: bigint;
  entryCount: number;
  entries: Array<{
    entryType: CashEntryType;
    amount: bigint;
    side: "debit" | "credit";
  }>;
}

export async function getPostingGroupSummary(
  ctx: QueryCtx,
  postingGroupId: string
): Promise<PostingGroupValidationResult>
```

Implementation approach:
1. Query entries via `by_posting_group` index
2. For each entry, load debit and credit accounts (cache to avoid re-reads)
3. Track CONTROL:ALLOCATION balance: +amount when debit account is CONTROL with ALLOCATION subaccount, -amount when credit account is CONTROL with ALLOCATION subaccount
4. Build entries array with entryType, amount, and which side is CONTROL
5. `isComplete` = `controlAllocationBalance === 0n && entryCount > 0`

**IMPORTANT:** Do NOT duplicate `getControlBalancesByPostingGroup()` from `reconciliation.ts`. That function computes balances for ALL transient subaccounts. This function is specifically about the ALLOCATION subaccount and adds entry-level detail.

### T-003: `isPostingGroupComplete()`
Pure predicate over `PostingGroupValidationResult`:

```typescript
export function isPostingGroupComplete(result: PostingGroupValidationResult): boolean {
  return result.controlAllocationBalance === 0n && result.entryCount > 0;
}
```

## Existing Code Patterns

### Types (from `types.ts`)
```typescript
export type CashEntryType = (typeof CASH_ENTRY_TYPES)[number];
// Includes: OBLIGATION_ACCRUED, CASH_RECEIVED, CASH_APPLIED, LENDER_PAYABLE_CREATED,
// SERVICING_FEE_RECOGNIZED, LENDER_PAYOUT_SENT, OBLIGATION_WAIVED, OBLIGATION_WRITTEN_OFF,
// REVERSAL, CORRECTION, SUSPENSE_ESCALATED, SUSPENSE_ROUTED

export type ControlSubaccount = "ACCRUAL" | "ALLOCATION" | "SETTLEMENT" | "WAIVER";
```

### Account reading pattern (from `reconciliation.ts`)
```typescript
// getControlBalancesByPostingGroup already does this — reference but don't duplicate
const entries = await ctx.db
  .query("cash_ledger_journal_entries")
  .withIndex("by_posting_group", (q) =>
    q.eq("postingGroupId", postingGroupId)
  )
  .collect();

// Account caching pattern:
const accountCache = new Map<string, Doc<"cash_ledger_accounts"> | null>();
async function getCachedAccount(accountId: Id<"cash_ledger_accounts">) {
  const key = accountId as string;
  if (accountCache.has(key)) return accountCache.get(key) ?? null;
  const account = await ctx.db.get(accountId);
  accountCache.set(key, account);
  return account;
}

// CONTROL subaccount is stored on the account record:
if (debitAccount?.family === "CONTROL" && debitAccount.subaccount) {
  const sub = debitAccount.subaccount;
  // ...
}
```

### Import conventions
```typescript
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { CashEntryType, ControlSubaccount } from "./types";
```

### Schema: `cash_ledger_accounts` has a `subaccount` field (optional string)
The `subaccount` field is a top-level field on the `cash_ledger_accounts` document, NOT inside `metadata`.

## File Location
Create: `convex/payments/cashLedger/postingGroups.ts`

## Quality Gate
After implementation, run:
- `bun check` (auto-formats, then reports lint errors)
- `bun typecheck`
- `bunx convex codegen`
