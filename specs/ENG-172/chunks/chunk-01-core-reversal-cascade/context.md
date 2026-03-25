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

Two-phase validation: first rejects non-positive or unsafe integers with `INVALID_REVERSAL_AMOUNT`, then rejects over-limit amounts with `REVERSAL_EXCEEDS_ORIGINAL`.

```typescript
function assertReversalAmountValid(
  reversalAmount: number,
  originalAmount: bigint,
  context: string
): void {
  // Phase 1: guard against non-positive / non-safe-integer values
  if (!Number.isSafeInteger(reversalAmount) || reversalAmount <= 0) {
    throw new ConvexError({
      code: "INVALID_REVERSAL_AMOUNT" as const,
      reversalAmount,
      context,
    });
  }
  // Phase 2: guard against reversal exceeding the original amount
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
11. **Find LENDER_PAYOUT_SENT entries** — for each lender from step 8, call `findPayoutEntryForClawback()` which uses a tiered lookup via `by_lender_and_sequence` and `by_posting_group` indexes.
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

### Important: Finding payout entries per lender (`findPayoutEntryForClawback`)

Payout detection uses a tiered strategy implemented in `findPayoutEntryForClawback()`. The function accepts a lender payable entry and progressively broadens its search until a matching `LENDER_PAYOUT_SENT` entry is found:

1. **Tier 1 — `dispersalEntryId` in obligation-scoped entries:** Scan `allObligationEntries` (already loaded) for a `LENDER_PAYOUT_SENT` with matching `dispersalEntryId`.
2. **Tier 2 — `dispersalEntryId` via `by_lender_and_sequence` index:** Query lender-scoped entries using `by_lender_and_sequence` (handles legacy payouts that lack `obligationId`).
3. **Tier 3 — `postingGroupId` via `by_posting_group` index:** Query entries sharing the allocation group's `postingGroupId`, filtered to `LENDER_PAYOUT_SENT` for the target lender.
4. **Tier 4 — `lenderId` + `mortgageId` fallback:** Broadest search via `by_lender_and_sequence`, matching by `mortgageId` to catch legacy payouts with no `dispersalEntryId`.

```typescript
const payoutEntry = await findPayoutEntryForClawback(
  ctx,
  lenderEntry,        // the LENDER_PAYABLE_CREATED being reversed
  currentLenderId,
  args.mortgageId,
  allObligationEntries // pre-loaded obligation entries from step 4
);
```

**Note:** The `by_lender_and_entry_type` index does **not** exist in the current schema. All payout lookups use `by_lender_and_sequence` and `by_posting_group` instead.

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
