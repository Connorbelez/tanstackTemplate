# Chunk 03 Context: Tests

## Goal
Comprehensive test suite for journal replay integrity: correctness, drift detection, scope filtering, edge cases, cursor management, and reversal handling.

## File to Create
`convex/payments/cashLedger/__tests__/replayIntegrity.test.ts`

## Test Harness Pattern
Follow the existing pattern from `testUtils.ts`:

```typescript
import { convexTest } from "convex-test";
import schema from "../../../schema";

// Callers must pass import.meta.glob from their test file
const modules = import.meta.glob("/convex/**/*.ts");

function createHarness() {
  return convexTest(schema, modules);
}
```

Use `seedMinimalEntities` from `testUtils.ts` for entity setup. Use `postTestEntry` for posting journal entries. Use `createTestAccount` for setting up accounts.

## Existing Test Utils (`testUtils.ts`)

```typescript
export const SYSTEM_SOURCE = {
  channel: "scheduler" as const,
  actorId: "system",
  actorType: "system" as const,
};

export function createHarness(modules: Record<string, () => Promise<unknown>>) {
  return convexTest(schema, modules);
}

export async function seedMinimalEntities(t: TestHarness) {
  // Returns: { borrowerId, lenderAId, lenderBId, mortgageId }
}

export async function createTestAccount(t: TestHarness, spec: CreateTestAccountSpec) {
  // Creates a cash_ledger_account with optional initial balances
}

export async function postTestEntry(t: TestHarness, args: PostCashEntryInput) {
  // Convenience wrapper around postCashEntryInternal
}
```

## PostCashEntryInput Interface
From `postEntry.ts`, the input for posting an entry:
```typescript
export interface PostCashEntryInput {
  entryType: CashEntryType;
  debitAccountId: Id<"cash_ledger_accounts">;
  creditAccountId: Id<"cash_ledger_accounts">;
  amount: bigint;
  effectiveDate: string;     // YYYY-MM-DD
  idempotencyKey: string;
  source: { actorType: string; actorId?: string; channel?: string };
  mortgageId?: Id<"mortgages">;
  obligationId?: Id<"obligations">;
  lenderId?: Id<"lenders">;
  borrowerId?: Id<"borrowers">;
  postingGroupId?: string;
  causedBy?: Id<"cash_ledger_journal_entries">;
  reason?: string;
  metadata?: Record<string, unknown>;
}
```

## How to Call Replay in Tests
The replay function is a pure async function taking `QueryCtx`:
```typescript
import { replayJournalIntegrity } from "../replayIntegrity";

// Inside t.run():
const result = await replayJournalIntegrity(ctx, { mode: "full" });
```

## How to Call Cursor Advancement in Tests
```typescript
import { advanceReplayCursor } from "../replayIntegrity";
// This is an internalMutation, call via t.mutation()
```

## Test Cases Detail

### T-012: Clean replay passes
1. Seed entities with `seedMinimalEntities`
2. Create debit + credit accounts
3. Post 5 balanced entries (OBLIGATION_ACCRUED, CASH_RECEIVED, etc.)
4. Run `replayJournalIntegrity(ctx, { mode: "full" })`
5. Assert: `passed === true`, `mismatches.length === 0`, `entriesReplayed === 5`, `accountsChecked > 0`

### T-013: Drift detection
1. Post entries normally (they update account cumulativeDebits/Credits)
2. Manually patch one account's `cumulativeDebits` to a wrong value via `ctx.db.patch()`
3. Run replay
4. Assert: `passed === false`, `mismatches.length === 1`, mismatch contains the correct expected vs stored values

### T-014: Missing sequence detection
1. Post entries normally, then manually insert an entry with a skipped sequence number
2. Run replay in full mode
3. Assert: `missingSequences` contains the gap numbers

### T-015: Account scope
1. Post entries across multiple accounts (account A and B)
2. Run replay with `accountId: accountA._id`
3. Assert: only entries involving account A are replayed, `entriesReplayed` is less than total

### T-016: Mortgage scope
1. Post entries across two different mortgages
2. Run replay with `mortgageId: mortgage1`
3. Assert: only entries for mortgage1 are replayed

### T-017: Empty ledger
1. Don't post any entries
2. Run replay
3. Assert: `passed === true`, `entriesReplayed === 0`, `accountsChecked === 0`

### T-018: Idempotent replay
1. Post entries
2. Run replay twice
3. Assert: both results are identical

### T-019: Credit-normal vs debit-normal
Credit-normal families: LENDER_PAYABLE, SERVICING_REVENUE, CASH_CLEARING, UNAPPLIED_CASH
Debit-normal families: BORROWER_RECEIVABLE, TRUST_CASH, WRITE_OFF, SUSPENSE, CONTROL

1. Create entries involving both family types
2. Run replay
3. Assert: passed (correct handling of both normal types)

### T-020: Cursor advancement
1. Post 3 entries, run replay, advance cursor to last sequence
2. Post 2 more entries
3. Run replay in `incremental` mode
4. Assert: `entriesReplayed === 2`, `fromSequence` matches cursor value

### T-021: REVERSAL entries
1. Post a CASH_RECEIVED entry (debit TRUST_CASH, credit BORROWER_RECEIVABLE)
2. Post a REVERSAL entry (debit BORROWER_RECEIVABLE, credit TRUST_CASH — mirror)
3. Run replay
4. Assert: both accounts' replayed debits/credits correctly include the reversal

## Constraints
- All tests use `convex-test` with `schema` import
- No network calls, no real auth
- Every test creates its own harness for isolation
- Use `describe` blocks to group related tests
- Run `bun check` after writing all tests
