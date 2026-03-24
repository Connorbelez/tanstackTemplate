# Chunk 2 Context: Correction Workflow Tests

## Overview
Create a comprehensive test suite for the admin correction workflow in `convex/payments/cashLedger/__tests__/corrections.test.ts`.

## Test File Location
`convex/payments/cashLedger/__tests__/corrections.test.ts`

## Test Utilities Available
Import from `./testUtils`:
```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../../schema";
import { postCashEntryInternal } from "../postEntry";
import { postCashCorrectionForEntry } from "../integrations";
import {
  ADMIN_SOURCE,
  SYSTEM_SOURCE,
  createHarness,
  createTestAccount,
  postTestEntry,
  seedMinimalEntities,
} from "./testUtils";
```

### Key Test Utils:
- `createHarness(modules)` — creates a convexTest instance. Pass `import.meta.glob("/convex/**/*.ts")`.
- `seedMinimalEntities(t)` — returns `{ borrowerId, lenderAId, lenderBId, mortgageId }`
- `createTestAccount(t, spec)` — creates a cash ledger account by family with optional initial balances
- `postTestEntry(t, args)` — posts a journal entry via `postCashEntryInternal`
- `ADMIN_SOURCE` — `{ channel: "admin_dashboard", actorId: "admin-user-123", actorType: "admin" }`
- `SYSTEM_SOURCE` — `{ channel: "scheduler", actorId: "system", actorType: "system" }`

### Test Pattern (from existing tests)
```typescript
const modules = import.meta.glob("/convex/**/*.ts");

describe("corrections", () => {
  it("should do X", async () => {
    const t = createHarness(modules);
    const { mortgageId, borrowerId } = await seedMinimalEntities(t);

    // Create accounts
    const debitAccount = await createTestAccount(t, {
      family: "BORROWER_RECEIVABLE",
      mortgageId,
      borrowerId,
      initialDebitBalance: 100000n,
    });
    const creditAccount = await createTestAccount(t, {
      family: "CONTROL",
      mortgageId,
      subaccount: "ACCRUAL",
    });

    // Post original entry
    const original = await postTestEntry(t, {
      entryType: "OBLIGATION_ACCRUED",
      effectiveDate: "2026-03-01",
      amount: 100000,
      debitAccountId: debitAccount._id,
      creditAccountId: creditAccount._id,
      idempotencyKey: "cash-ledger:test-original:1",
      mortgageId,
      borrowerId,
      source: SYSTEM_SOURCE,
    });

    // ... test correction ...
  });
});
```

## Test Cases to Implement

### T-006: Simple Reversal
1. Seed entities and create BORROWER_RECEIVABLE + CONTROL:ACCRUAL accounts
2. Post an OBLIGATION_ACCRUED entry (debit BORROWER_RECEIVABLE, credit CONTROL)
3. Call `postCashCorrectionForEntry` with just the originalEntryId (no replacement)
4. Verify:
   - Original entry is unchanged (re-read from DB)
   - Reversal entry has `entryType: "REVERSAL"`
   - Reversal entry has `causedBy: original._id`
   - Reversal has swapped accounts: `debitAccountId === original.creditAccountId` and `creditAccountId === original.debitAccountId`
   - Reversal amount === original amount
   - Net balance on BORROWER_RECEIVABLE is 0 (debits == credits)
   - postingGroupId starts with "correction:"

### T-007: Correction with Replacement
1. Post original OBLIGATION_ACCRUED for 100000 cents
2. Call `postCashCorrectionForEntry` with replacement: amount 80000, same accounts, same entryType
3. Verify:
   - Reversal entry exists with full original amount (100000)
   - Replacement entry exists with 80000
   - Both have `causedBy: original._id`
   - Both share same `postingGroupId`
   - Net balance on BORROWER_RECEIVABLE = 80000 (original 100000 - reversal 100000 + replacement 80000)

### T-008: Idempotency
1. Post original entry
2. Call correction twice with same parameters
3. Second call should return same reversal entry (idempotency key collision)
4. Only one reversal entry should exist in DB

### T-009: Non-Admin Rejection
1. Post original entry
2. Call `postCashCorrectionForEntry` with `source: SYSTEM_SOURCE` (not admin)
3. Expect ConvexError about admin actorType requirement
Note: The pipeline's `constraintCheck` enforces this for CORRECTION entries, but REVERSAL entries require `causedBy` (not admin). The integration helper posts REVERSAL + optional CORRECTION. The REVERSAL will succeed with system source. Test that calling with CORRECTION entryType replacement and non-admin source fails.

Actually — the integration helper posts entry type REVERSAL for the reversal (which only requires causedBy, not admin). The replacement uses caller-specified entryType. If the replacement entryType is CORRECTION, it will require admin. But the reversal itself doesn't require admin.

The `postCashCorrection` internalMutation and `postCashCorrectionForEntry` should validate that the source has admin actorType at the orchestration level, not just rely on the pipeline. Add this check.

### T-010: Missing Reason Rejection
1. Call `postCashCorrectionForEntry` (and/or `postCashCorrection`) with an empty/whitespace reason
2. Expect rejection from correction-orchestration validation
3. Keep direct `postCashEntryInternal` reason checks in pipeline-focused tests only

### T-011: Replacement Exceeds Original Amount
1. Post original entry for 50000
2. Call correction with replacement amount 60000
3. Expect ConvexError about replacement exceeding original

### T-012: Original Entry Immutability
1. Post original entry, capture all field values
2. Run correction
3. Re-read original entry from DB
4. Assert every field matches the captured values exactly

### T-013: Correction Chain Auditability
1. Post entry A
2. Correct A → creates reversal B (causedBy: A)
3. Post a new entry C (correction replacement, causedBy: A)
4. Query by `causedBy` index for A's ID
5. Verify both B and C are found
6. Verify the chain is traversable: A → [B, C]

### T-014: postCashCorrectionForEntry Integration Helper
1. Test that it works end-to-end with a real obligation scenario
2. Seed a settled obligation with BORROWER_RECEIVABLE balance
3. Post an OBLIGATION_ACCRUED entry
4. Call `postCashCorrectionForEntry`
5. Verify the helper returns { reversalEntry, replacementEntry: null, postingGroupId }
6. Verify the entries are correctly persisted

## Existing Test Files for Pattern Reference
Look at these existing test files for patterns:
- `postEntry.test.ts` — basic posting pipeline tests
- `lenderPayoutPosting.test.ts` — mutation-level tests
- `constraintsAndBalanceExemption.test.ts` — constraint check tests
- `postingGroupIntegration.test.ts` — multi-entry posting group tests

## Quality Gate
After all tests are written:
```bash
bun run test
```
All existing tests must continue passing. The new correction tests must all pass.

## Constraints
- Use `convex-test` for all tests (same as existing test files)
- Follow existing test naming and structure patterns
- Use `ADMIN_SOURCE` for correction tests (admin required)
- Use `SYSTEM_SOURCE` for initial entry posting
- All amounts in cents (safe integers)
- The `amount` field on journal entries is `bigint` in the DB
