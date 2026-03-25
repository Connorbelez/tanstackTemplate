# Chunk 1 Context: Core Cascade Function

## What You're Building

Three things in `convex/payments/cashLedger/integrations.ts`:
1. `assertReversalAmountValid()` — helper to validate reversal amount ≤ original
2. `postPaymentReversalCascade()` — multi-leg reversal orchestrator
3. `postTransferReversal()` — single-entry transfer reversal

Plus a verification pass on `types.ts` for REVERSAL constraints.

## Linear Issue: ENG-172

**Summary:** Implement REVERSAL entry type for payment reversals (PAD up to 90 days, ACH up to 60 days). Ledger-first reversal design: obligation stays settled; cash ledger corrects balances.

**Acceptance Criteria:**
- All REVERSAL entries have `causedBy` referencing original
- Reversal amount ≤ original entry amount
- Multi-leg reversal cascade works atomically
- Idempotent on `originalAttemptId`
- Settled obligations with non-zero balance detectable

## Reversal Posting Sequence (from Tech Design §5)

```
Payment reversal received:

1. REVERSAL: Debit BORROWER_RECEIVABLE, Credit TRUST_CASH
   causedBy: original CASH_RECEIVED entry
   idempotencyKey: reversal:{originalAttemptId}

2. REVERSAL: Debit LENDER_PAYABLE, Credit CONTROL:ALLOCATION (per lender)
   causedBy: original LENDER_PAYABLE_CREATED entry

3. REVERSAL: Debit SERVICING_REVENUE, Credit CONTROL:ALLOCATION
   causedBy: original SERVICING_FEE_RECOGNIZED entry

4. IF payout already sent:
   REVERSAL: Debit LENDER_PAYABLE (negative = clawback), Credit TRUST_CASH
   causedBy: original LENDER_PAYOUT_SENT entry

All share postingGroupId: reversal-group:{originalAttemptId}
```

## Design Decision

Obligation remains `settled` in domain model. Journal-derived balance reverts to outstanding. Reconciliation query detects "settled with non-zero receivable" as reversal indicator.

## Function Signatures (from Implementation Plan)

### postPaymentReversalCascade()

```typescript
export async function postPaymentReversalCascade(
  ctx: MutationCtx,
  args: {
    // Identify what to reverse
    attemptId?: Id<"collectionAttempts">;
    transferRequestId?: Id<"transferRequests">;
    obligationId: Id<"obligations">;
    mortgageId: Id<"mortgages">;
    // Reversal details
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

**Logic:**
1. Resolve the original attempt identifier — either `attemptId` or `transferRequestId`.
2. Generate `postingGroupId`: `reversal-group:{attemptId}` (or `reversal-group:transfer:{transferRequestId}`).
3. Idempotency check: Query `by_posting_group` index for existing reversal group. If entries exist, return them (full idempotency).
4. Find original CASH_RECEIVED entry — query `by_obligation_and_sequence` filtered by `entryType === "CASH_RECEIVED"` and matching `attemptId`/`transferRequestId`.
5. Validate reversal amount ≤ original amount.
6. **Step 1** — Reverse CASH_RECEIVED: debit original's `creditAccountId` (BORROWER_RECEIVABLE), credit original's `debitAccountId` (TRUST_CASH). `causedBy`: original CASH_RECEIVED entry ID. `idempotencyKey`: `buildIdempotencyKey("reversal", "cash-received", attemptId)`.
7. Find original LENDER_PAYABLE_CREATED entries — query `by_posting_group` for the allocation posting group (`allocation:{obligationId}`), filter by `entryType === "LENDER_PAYABLE_CREATED"`.
8. **Step 2** — Reverse each LENDER_PAYABLE_CREATED: debit LENDER_PAYABLE, credit CONTROL:ALLOCATION. `causedBy`: original LENDER_PAYABLE_CREATED entry ID. `idempotencyKey`: `buildIdempotencyKey("reversal", "lender-payable", dispersalEntryId)`.
9. Find original SERVICING_FEE_RECOGNIZED entry — same posting group, filter by entryType.
10. **Step 3** — Reverse SERVICING_FEE_RECOGNIZED: debit SERVICING_REVENUE, credit CONTROL:ALLOCATION. `causedBy`: original entry ID.
11. Check for LENDER_PAYOUT_SENT entries — query by lenderId + entryType for each lender.
12. **Step 4 (conditional)** — Reverse LENDER_PAYOUT_SENT (clawback): only if payout was already sent. Debit LENDER_PAYABLE (creates negative = clawback receivable), credit TRUST_CASH.
13. All entries share the same `postingGroupId`.
14. Return results including whether clawback was required.

### assertReversalAmountValid()

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

### postTransferReversal()

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

This is a simpler function for single-entry transfer reversals (used by ENG-175 webhook handlers). The full cascade `postPaymentReversalCascade` orchestrates multiple calls internally.

## Existing Patterns to Follow

### postCashCorrectionForEntry() — the model for single-entry reversal

Located in `integrations.ts`. It:
1. Loads the original entry via `ctx.db.get(originalEntryId)`
2. Validates admin source and non-empty reason
3. Posts a REVERSAL entry with swapped debit/credit from original
4. Optionally posts a replacement entry
5. Uses posting group ID: `correction:{originalEntryId}:{timestamp}`

**Follow this pattern** for how to swap debit/credit accounts and set causedBy.

### postSettlementAllocation() — the model for multi-entry posting groups

Located in `integrations.ts`. It:
1. Calls `validatePostingGroupAmounts()` for sum validation
2. Generates `postingGroupId`: `allocation:{obligationId}`
3. Loops entries, calling `postCashEntryInternal()` for each
4. Each entry gets its own `idempotencyKey` but shares the `postingGroupId`

**Follow this pattern** for how multi-entry posting groups are structured.

### Key helpers to use:
- `postCashEntryInternal(ctx, input)` — all entries go through this 9-step pipeline
- `normalizeSource(source)` — normalize source format
- `getOrCreateCashAccount(ctx, spec)` — create or find account by spec
- `findCashAccount(ctx.db, spec)` — find existing account
- `requireCashAccount(ctx.db, spec, label)` — find or throw
- `safeBigintToNumber(value)` — BigInt → number conversion
- `buildIdempotencyKey(entryType, ...segments)` — builds `cash-ledger:{type}:{segments}`
- `unixMsToBusinessDate(ms)` — converts timestamp to YYYY-MM-DD

### Entry type family map (from types.ts):
```typescript
REVERSAL: { debit: ALL_FAMILIES, credit: ALL_FAMILIES }
```
REVERSAL entries are allowed any debit/credit family combination.

### Balance check exemption (from postEntry.ts):
REVERSAL and CORRECTION entries **skip balance checks entirely** in Step 5 of the pipeline. This is already implemented.

### Constraint check (from postEntry.ts):
REVERSAL entries **must** have `causedBy` — enforced in Step 6.

### Querying entries by posting group:
```typescript
const entries = await ctx.db
  .query("cash_ledger_journal_entries")
  .withIndex("by_posting_group", (q) => q.eq("postingGroupId", groupId))
  .collect();
```

### Querying entries by obligation and filtering:
```typescript
const entries = await ctx.db
  .query("cash_ledger_journal_entries")
  .withIndex("by_obligation_and_sequence", (q) => q.eq("obligationId", obligationId))
  .collect();
const cashReceived = entries.filter(e => e.entryType === "CASH_RECEIVED" && e.attemptId === attemptId);
```

## Constraints
- **Append-only invariant:** No existing journal entries are ever mutated or deleted.
- **causedBy required:** Every REVERSAL entry must reference the original via `causedBy`.
- **Cents integrity:** All amounts are safe integers in cents. Use `safeBigintToNumber()` for BigInt conversion.
- **Idempotency:** Full cascade is idempotent on `postingGroupId`. Individual entries are idempotent on `idempotencyKey`.
- **Source attribution:** All reversal entries must carry `source` with appropriate actorType and channel.
- **Audit trail:** Every reversal entry triggers hash-chain audit via the existing `nudge` step in `postEntry.ts`.

## File Map
| File | Action | Purpose |
|------|--------|---------|
| `convex/payments/cashLedger/integrations.ts` | **Modify** | Add `postPaymentReversalCascade()`, `postTransferReversal()`, `assertReversalAmountValid()` |
| `convex/payments/cashLedger/types.ts` | **Verify** | Confirm REVERSAL family constraints, add balance check exemption documentation comment |
