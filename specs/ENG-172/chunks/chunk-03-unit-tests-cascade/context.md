# Chunk 03 Context: Unit Tests — Reversal Cascade

## What You're Building

Test file: `convex/payments/cashLedger/__tests__/reversalCascade.test.ts`

## Test Infrastructure Pattern

Follow the existing test patterns from `corrections.test.ts`, `lenderPayoutPosting.test.ts`, etc.:

```typescript
import { describe, expect, it } from "vitest";
import type { Doc } from "../../../_generated/dataModel";
import { getCashAccountBalance } from "../accounts";
import { postPaymentReversalCascade, postTransferReversal } from "../integrations";
import { postCashEntryInternal } from "../postEntry";
import { getPostingGroupSummary } from "../postingGroups";
import {
  ADMIN_SOURCE,
  createHarness,
  createTestAccount,
  seedMinimalEntities,
  createSettledObligation,
  postTestEntry,
  SYSTEM_SOURCE,
} from "./testUtils";

const modules = import.meta.glob("/convex/**/*.ts");
```

## Test Setup Pattern

For each test that needs a full settlement + allocation state:

1. Call `seedMinimalEntities(t)` → gets `{ borrowerId, lenderAId, lenderBId, mortgageId }`
2. Create a settled obligation via `createSettledObligation(t, { mortgageId, borrowerId, amount: 100_000 })`
3. Post CASH_RECEIVED entry manually via `postTestEntry`
4. Post allocation entries (LENDER_PAYABLE_CREATED × N + SERVICING_FEE_RECOGNIZED) via `postTestEntry`
5. Optionally post LENDER_PAYOUT_SENT entries for clawback tests
6. Call `postPaymentReversalCascade()` and verify results

### Creating the pre-reversal state

```typescript
// In t.run():
// 1. Create accounts
const trustCash = await getOrCreateCashAccount(ctx, { family: "TRUST_CASH", mortgageId });
const receivable = await findCashAccount(ctx.db, { family: "BORROWER_RECEIVABLE", mortgageId, obligationId });
const allocationControl = await findCashAccount(ctx.db, { family: "CONTROL", mortgageId, obligationId, subaccount: "ALLOCATION" });

// 2. Post CASH_RECEIVED
const cashReceivedResult = await postCashEntryInternal(ctx, {
  entryType: "CASH_RECEIVED",
  effectiveDate: "2026-03-01",
  amount: 100_000,
  debitAccountId: trustCash._id,
  creditAccountId: receivable._id,
  idempotencyKey: "cash-ledger:cash-received:test-attempt-1",
  mortgageId,
  obligationId,
  attemptId, // if using attempt-based
  source: SYSTEM_SOURCE,
});

// 3. Post LENDER_PAYABLE_CREATED entries
const lenderAPayable = await getOrCreateCashAccount(ctx, { family: "LENDER_PAYABLE", mortgageId, lenderId: lenderAId });
await postCashEntryInternal(ctx, {
  entryType: "LENDER_PAYABLE_CREATED",
  effectiveDate: "2026-03-01",
  amount: 54_000,
  debitAccountId: allocationControl._id,
  creditAccountId: lenderAPayable._id,
  idempotencyKey: "cash-ledger:lender-payable:dispersal-a",
  mortgageId, obligationId, lenderId: lenderAId,
  dispersalEntryId: dispersalAId,
  postingGroupId: `allocation:${obligationId}`,
  source: SYSTEM_SOURCE,
});
// Repeat for lender B...

// 4. Post SERVICING_FEE_RECOGNIZED
const servicingRevenue = await getOrCreateCashAccount(ctx, { family: "SERVICING_REVENUE", mortgageId });
await postCashEntryInternal(ctx, {
  entryType: "SERVICING_FEE_RECOGNIZED",
  effectiveDate: "2026-03-01",
  amount: 10_000,
  debitAccountId: allocationControl._id,
  creditAccountId: servicingRevenue._id,
  idempotencyKey: "cash-ledger:servicing-fee:test-obligation",
  mortgageId, obligationId,
  postingGroupId: `allocation:${obligationId}`,
  source: SYSTEM_SOURCE,
});
```

**Note:** You need to create `collectionAttempts` and `dispersalEntries` records for the foreign keys. Create them with minimal required fields.

## Test Cases

### T-006: Full reversal cascade
- Set up: CASH_RECEIVED (100k) + LENDER_PAYABLE_CREATED ×2 (54k + 36k) + SERVICING_FEE (10k)
- Call `postPaymentReversalCascade()` with the attemptId
- Assert: 4 REVERSAL entries returned (1 cash + 2 lender + 1 fee)
- Assert: clawbackRequired === false

### T-007: Cascade with clawback
- Same setup as T-006, PLUS post LENDER_PAYOUT_SENT for each lender
- Call cascade
- Assert: 6 REVERSAL entries (4 base + 2 clawback)
- Assert: clawbackRequired === true

### T-008: Cascade without clawback
- Same as T-006 (no payouts)
- Assert clawbackRequired === false
- Assert only 4 entries

### T-009: Idempotency
- Call cascade twice with same args
- Assert: same entries returned both times
- Assert: no duplicate entries in DB (query by postingGroupId, count should be same)

### T-010: Amount validation
- Post original with amount 100_000
- Modify the original entry's amount to be less than what cascade expects (or test via postTransferReversal with excessive amount)
- Actually: `assertReversalAmountValid` is called internally. Test by ensuring the cascade doesn't throw for valid amounts and does throw for invalid ones.

### T-011: causedBy linkage
- After cascade, verify every returned entry has `causedBy` set
- Verify each `causedBy` points to the correct original entry type

### T-012: Posting group integrity
- After cascade, call `getPostingGroupSummary(ctx, reversalPostingGroupId)`
- Verify CONTROL:ALLOCATION balance is 0n within the reversal posting group
- Verify all entries share the same `postingGroupId`

### T-013: postTransferReversal
- Post a CASH_RECEIVED entry with `transferRequestId`
- Call `postTransferReversal()` with that entry
- Verify REVERSAL entry has swapped accounts, correct causedBy, correct idempotencyKey

## Account Balance Conventions

Use `getCashAccountBalance()` from accounts.ts. Remember:
- Debit-normal families (BORROWER_RECEIVABLE, WRITE_OFF, SUSPENSE, TRUST_CASH): balance = debits - credits
- Credit-normal families (LENDER_PAYABLE, SERVICING_REVENUE, CASH_CLEARING, UNAPPLIED_CASH): balance = credits - debits
- CONTROL: debit-normal (balance = debits - credits)

## Constraints

- Tests use `createHarness(modules)` which sets `DISABLE_CASH_LEDGER_HASHCHAIN=true`
- Use `t.run()` for all DB operations
- Follow existing Biome conventions (top-level regex patterns, etc.)
