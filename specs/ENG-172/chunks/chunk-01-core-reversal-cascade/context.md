# Chunk 01 Context: Core Reversal Cascade Function

## What You're Building

Three functions in `convex/payments/cashLedger/integrations.ts`:

1. **`assertReversalAmountValid()`** — pure validation helper
2. **`postPaymentReversalCascade()`** — multi-leg reversal that reverses an entire settlement's posting group
3. **`postTransferReversal()`** — single-entry reversal for transfer-backed payments (used by ENG-175 webhook handlers)

## Reversal Posting Sequence (from Tech Design §5)

```
Payment reversal received:

1. REVERSAL: Debit BORROWER_RECEIVABLE, Credit TRUST_CASH
   causedBy: original CASH_RECEIVED entry
   idempotencyKey: cash-ledger:reversal:cash-received:{attemptId}

2. REVERSAL: Debit LENDER_PAYABLE, Credit CONTROL:ALLOCATION (per lender)
   causedBy: original LENDER_PAYABLE_CREATED entry
   idempotencyKey: cash-ledger:reversal:lender-payable:{dispersalEntryId}

3. REVERSAL: Debit SERVICING_REVENUE, Credit CONTROL:ALLOCATION
   causedBy: original SERVICING_FEE_RECOGNIZED entry
   idempotencyKey: cash-ledger:reversal:servicing-fee:{obligationId}

4. IF payout already sent:
   REVERSAL: Debit LENDER_PAYABLE (negative = clawback), Credit TRUST_CASH
   causedBy: original LENDER_PAYOUT_SENT entry
   idempotencyKey: cash-ledger:reversal:payout-clawback:{lenderId}:{attemptId}

All share postingGroupId: reversal-group:{attemptId}
```

## T-001: assertReversalAmountValid()

```typescript
function assertReversalAmountValid(
  reversalAmount: number,
  originalAmount: bigint,
  context: string
): void {
  const originalNumber = safeBigintToNumber(originalAmount);
  if (reversalAmount > originalNumber) {
    throw new ConvexError({
      code: "REVERSAL_EXCEEDS_ORIGINAL" as const,
      reversalAmount,
      originalAmount: originalNumber,
      context,
    });
  }
}
```

Import `safeBigintToNumber` from `./accounts` (already imported in integrations.ts).

## T-002: postPaymentReversalCascade()

### Signature

```typescript
export async function postPaymentReversalCascade(
  ctx: MutationCtx,
  args: {
    attemptId?: Id<"collectionAttempts">;
    transferRequestId?: Id<"transferRequests">;
    obligationId: Id<"obligations">;
    mortgageId: Id<"mortgages">;
    effectiveDate: string;
    source: CommandSource;
    reason: string;
  }
): Promise<{
  reversalEntries: Doc<"cash_ledger_journal_entries">[];
  postingGroupId: string;
  clawbackRequired: boolean;
}>
```

### Logic

1. **Resolve identifier** — require at least one of `attemptId` or `transferRequestId`.
2. **Generate `postingGroupId`:** `reversal-group:{attemptId}` or `reversal-group:transfer:{transferRequestId}`.
3. **Idempotency check:** Query `by_posting_group` index. If entries exist, return them.
4. **Find original CASH_RECEIVED entry** — query `by_obligation_and_sequence` filtered by `entryType === "CASH_RECEIVED"` and matching `attemptId` or `transferRequestId`. Throw if not found.
5. **Validate reversal amount** — call `assertReversalAmountValid`.
6. **Step 1 — Reverse CASH_RECEIVED:** Use `postCashEntryInternal()` with:
   - `entryType: "REVERSAL"`
   - `debitAccountId: original.creditAccountId` (BORROWER_RECEIVABLE)
   - `creditAccountId: original.debitAccountId` (TRUST_CASH)
   - `causedBy: original._id`
   - `amount: safeBigintToNumber(original.amount)`
   - `idempotencyKey: buildIdempotencyKey("reversal", "cash-received", attemptId ?? transferRequestId)`
   - Copy `mortgageId`, `obligationId`, `borrowerId`, `attemptId`, `transferRequestId` from original
   - `postingGroupId`
7. **Find original allocation entries** — query `by_posting_group` for `allocation:{obligationId}`, filter by `LENDER_PAYABLE_CREATED`.
8. **Step 2 — Reverse each LENDER_PAYABLE_CREATED:**
   - `debitAccountId: original.creditAccountId` (LENDER_PAYABLE)
   - `creditAccountId: original.debitAccountId` (CONTROL:ALLOCATION)
   - `causedBy: original._id`
   - `idempotencyKey: buildIdempotencyKey("reversal", "lender-payable", entry.dispersalEntryId ?? entry._id)`
9. **Find original SERVICING_FEE_RECOGNIZED** — same posting group, filter by entryType.
10. **Step 3 — Reverse SERVICING_FEE_RECOGNIZED:**
    - `debitAccountId: original.creditAccountId` (SERVICING_REVENUE)
    - `creditAccountId: original.debitAccountId` (CONTROL:ALLOCATION)
    - `causedBy: original._id`
    - `idempotencyKey: buildIdempotencyKey("reversal", "servicing-fee", args.obligationId)`
11. **Find LENDER_PAYOUT_SENT entries** — query by lenderId + entryType for each lender from step 8.
12. **Step 4 (conditional) — Reverse LENDER_PAYOUT_SENT (clawback):**
    - Only if payout entries exist
    - `debitAccountId: original.creditAccountId` (LENDER_PAYABLE — goes negative = clawback)
    - `creditAccountId: original.debitAccountId` (TRUST_CASH)
    - `causedBy: original._id`
    - `idempotencyKey: buildIdempotencyKey("reversal", "payout-clawback", lenderId, identifier)`
13. **Collect all entries, return result.**

### Key Patterns from Existing Code

- Use `postCashEntryInternal()` for every entry (9-step pipeline with audit)
- Use `normalizeSource()` for source normalization
- Use `getOrCreateCashAccount()` for account resolution when needed
- Use `findCashAccount()` for lookups
- Use `safeBigintToNumber()` for BigInt→number
- Follow `postCashCorrectionForEntry` pattern: swapped debit/credit accounts
- Use `buildIdempotencyKey()` for all keys (prefix: `cash-ledger:`)

### Important: Finding original entries by attemptId

To find the original CASH_RECEIVED entry, query `by_obligation_and_sequence`:
```typescript
const entries = await ctx.db
  .query("cash_ledger_journal_entries")
  .withIndex("by_obligation_and_sequence", (q) =>
    q.eq("obligationId", args.obligationId)
  )
  .collect();
const cashReceivedEntry = entries.find(
  (e) => e.entryType === "CASH_RECEIVED" &&
  (args.attemptId ? e.attemptId === args.attemptId : e.transferRequestId === args.transferRequestId)
);
```

### Important: Finding allocation entries

```typescript
const allocationGroupId = `allocation:${args.obligationId}`;
const allocationEntries = await ctx.db
  .query("cash_ledger_journal_entries")
  .withIndex("by_posting_group", (q) =>
    q.eq("postingGroupId", allocationGroupId)
  )
  .collect();
const lenderPayableEntries = allocationEntries.filter(
  (e) => e.entryType === "LENDER_PAYABLE_CREATED"
);
const servicingFeeEntry = allocationEntries.find(
  (e) => e.entryType === "SERVICING_FEE_RECOGNIZED"
);
```

### Important: Finding payout entries per lender

For each lender whose payable was reversed, check if a payout was sent:
```typescript
const payoutEntries = await ctx.db
  .query("cash_ledger_journal_entries")
  .withIndex("by_lender_and_entry_type", (q) =>
    q.eq("lenderId", lenderId).eq("entryType", "LENDER_PAYOUT_SENT")
  )
  .collect();
```

**CHECK INDEX AVAILABILITY:** Verify `by_lender_and_entry_type` exists in the schema. If not, use a different query strategy — e.g., filter from the obligation's entries or use `by_obligation_and_sequence` with a filter.

## T-003: postTransferReversal()

Simpler single-entry reversal for transfer-backed payments:

```typescript
export async function postTransferReversal(
  ctx: MutationCtx,
  args: {
    transferRequestId: Id<"transferRequests">;
    originalEntryId: Id<"cash_ledger_journal_entries">;
    amount: number;
    effectiveDate: string;
    source: CommandSource;
    reason: string;
  }
): Promise<{ entry: Doc<"cash_ledger_journal_entries"> }>
```

Logic:
1. Load original entry by `originalEntryId`.
2. Validate amount ≤ original amount.
3. Post REVERSAL with swapped accounts, `causedBy: original._id`.
4. `idempotencyKey: buildIdempotencyKey("reversal", "transfer", args.transferRequestId)`
5. Copy dimensional keys from original.

## Existing Imports in integrations.ts

Already available:
- `ConvexError` from "convex/values"
- `Doc`, `Id` from dataModel
- `MutationCtx` from server
- `CommandSource` from engine/types
- `findCashAccount`, `getCashAccountBalance`, `getOrCreateCashAccount`, `requireCashAccount`, `safeBigintToNumber` from "./accounts"
- `postCashEntryInternal` from "./postEntry"
- `validatePostingGroupAmounts` from "./postingGroups"
- `buildIdempotencyKey`, `CashEntryType` from "./types"
- `normalizeSource()` — local function in integrations.ts

## Constraints

- **Append-only invariant:** No existing journal entries mutated or deleted.
- **causedBy required:** Every REVERSAL must reference original via `causedBy` (enforced by `constraintCheck` in `postEntry.ts`).
- **Cents integrity:** All amounts are safe integers in cents.
- **Idempotency:** Full cascade is idempotent on `postingGroupId`. Individual entries are idempotent on `idempotencyKey`.
- **Source attribution:** All reversal entries carry `source` with appropriate `actorType` and `channel`.
- **Audit trail:** Every reversal entry triggers hash-chain audit via the `nudge` step in `postEntry.ts`.
