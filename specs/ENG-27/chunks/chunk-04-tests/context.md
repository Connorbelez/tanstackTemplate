# Chunk 04 Context: Tests

## What This Chunk Does
1. Update existing tests in `ledger.test.ts` to use `postEntryDirect` (internalMutation) instead of the removed public `postEntry`
2. Create comprehensive pipeline tests in `postEntry.test.ts`

## Existing Test Infrastructure (from ledger.test.ts)

### Test Identity
```typescript
const LEDGER_TEST_IDENTITY = {
  subject: "test-ledger-user",
  issuer: "https://api.workos.com",
  org_id: FAIRLEND_STAFF_ORG_ID,
  organization_name: "FairLend Staff",
  role: "admin",
  roles: JSON.stringify(["admin"]),
  permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
  user_email: "ledger-test@fairlend.ca",
  user_first_name: "Ledger",
  user_last_name: "Tester",
};
```
Note: `FAIRLEND_STAFF_ORG_ID` is imported from `../../constants`.

### Test Harness Pattern
```typescript
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

function createTestHarness() {
  return convexTest(schema, modules);
}

function asLedgerUser(t: ReturnType<typeof createTestHarness>) {
  return t.withIdentity(LEDGER_TEST_IDENTITY);
}
```

### Existing Helpers
```typescript
const SYS_SOURCE = { type: "system" as const, channel: "test" };
const ADMIN_SOURCE = { type: "user" as const, actor: "admin-1", channel: "admin" };

async function mintAndIssue(
  t: ReturnType<typeof createTestHarness>,
  mortgageId: string,
  lenderId: string,
  amount = 10_000n
) {
  const auth = asLedgerUser(t);
  const mintResult = await auth.mutation(api.ledger.mutations.mintMortgage, {
    mortgageId,
    effectiveDate: "2026-01-01",
    idempotencyKey: `mint-${mortgageId}`,
    source: SYS_SOURCE,
  });
  // If amount < 10_000, issue to lender
  if (amount < 10_000n) {
    await auth.mutation(api.ledger.mutations.issueShares, {
      mortgageId,
      lenderId,
      amount,
      effectiveDate: "2026-01-01",
      idempotencyKey: `issue-${mortgageId}-${lenderId}`,
      source: SYS_SOURCE,
    });
  } else {
    // Issue full treasury to lender
    await auth.mutation(api.ledger.mutations.issueShares, {
      mortgageId,
      lenderId,
      amount: 10_000n,
      effectiveDate: "2026-01-01",
      idempotencyKey: `issue-${mortgageId}-${lenderId}`,
      source: SYS_SOURCE,
    });
  }
  return mintResult;
}
```

## Changes Needed in ledger.test.ts

### API Change
The public `postEntry` mutation is gone. Tests that call `api.ledger.mutations.postEntry` must change to `internal.ledger.mutations.postEntryDirect`.

Key difference: `api.*` uses `.mutation()`, but `internal.*` must use `.mutation()` with the internal reference. In convex-test, internal mutations are called the same way:
```typescript
// Before:
await auth.mutation(api.ledger.mutations.postEntry, { ... });
// After:
await auth.mutation(internal.ledger.mutations.postEntryDirect, { ... });
```

Import change needed: add `internal` to the import from `../../_generated/api`.

### Scan for affected tests
Search for `api.ledger.mutations.postEntry` in ledger.test.ts — these are the tests to update. The convenience mutation tests (mintMortgage, issueShares, etc.) stay unchanged since those exports remain public.

## New Test File: postEntry.test.ts

### Structure
```typescript
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

// Reuse same test helpers as ledger.test.ts
```

### Happy Path Tests (per entry type)

**MORTGAGE_MINTED:**
- Mint via mintMortgage convenience mutation
- Verify journal entry has entryType: "MORTGAGE_MINTED", amount: 10_000n
- Verify TREASURY account balance == 10,000

**SHARES_ISSUED:**
- Mint mortgage, then issue shares via issueShares
- Verify journal entry has entryType: "SHARES_ISSUED"
- Verify POSITION balance == issued amount, TREASURY balance decreased

**SHARES_TRANSFERRED:**
- Mint, issue to seller, then transfer via transferShares
- Verify both POSITION balances updated correctly

**SHARES_REDEEMED:**
- Mint, issue, then redeem via redeemShares
- Verify POSITION decreased, TREASURY increased

**MORTGAGE_BURNED:**
- Mint, verify all shares in treasury, then burn via burnMortgage
- Verify TREASURY and WORLD balances

**CORRECTION:**
- Mint, issue, then call postEntryDirect with CORRECTION type
- Verify causedBy, reason, admin source all required

**SHARES_RESERVED (audit-only):**
- Mint, issue to two positions, then call postEntryDirect with SHARES_RESERVED
- Verify journal entry created
- Verify cumulativeDebits and cumulativeCredits on BOTH accounts are UNCHANGED

**SHARES_COMMITTED:**
- Mint, issue to two positions, reserve, then commit
- Verify cumulatives ARE updated

**SHARES_VOIDED (audit-only):**
- Mint, issue to two positions, reserve, then void
- Verify cumulatives unchanged

### Rejection Tests

**INVALID_AMOUNT:**
```typescript
await expect(auth.mutation(internal.ledger.mutations.postEntryDirect, {
  ...baseArgs, amount: 0n,
})).rejects.toThrow(ConvexError);
```

**SAME_ACCOUNT:**
- debitAccountId === creditAccountId → ConvexError "SAME_ACCOUNT"

**ACCOUNT_NOT_FOUND:**
- Non-existent account ID → ConvexError "ACCOUNT_NOT_FOUND"

**TYPE_MISMATCH:**
- MORTGAGE_MINTED with POSITION as debit → ConvexError "TYPE_MISMATCH"
- SHARES_ISSUED with WORLD as credit → ConvexError "TYPE_MISMATCH"

**INSUFFICIENT_BALANCE:**
- SHARES_TRANSFERRED amount > credit account balance → ConvexError "INSUFFICIENT_BALANCE"

**MIN_FRACTION_VIOLATED:**
- Transfer that would leave seller with 500 units (between 1-999) → ConvexError "MIN_FRACTION_VIOLATED"

**MORTGAGE_MISMATCH:**
- SHARES_TRANSFERRED between positions on different mortgages → ConvexError "MORTGAGE_MISMATCH"

**CORRECTION requirements:**
- Missing causedBy → ConvexError "CORRECTION_REQUIRES_CAUSED_BY"
- Missing reason → ConvexError "CORRECTION_REQUIRES_REASON"
- Non-admin source → ConvexError "CORRECTION_REQUIRES_ADMIN"

### Special Cases

**Idempotency:**
- Call postEntryDirect twice with same idempotencyKey
- Second call returns same entry, no side effects (account balances unchanged)

**Sequence monotonicity:**
- Create multiple entries, verify sequenceNumbers are 1, 2, 3...

**Sell-all exception:**
- POSITION with 1,000 units transfers all 1,000 → allowed (goes to 0)

**WORLD exemption:**
- After MORTGAGE_MINTED, WORLD cumulativeCredits > cumulativeDebits → negative "balance" is fine

### ConvexError Assertion Pattern
```typescript
// For testing ConvexError with specific codes
try {
  await auth.mutation(internal.ledger.mutations.postEntryDirect, badArgs);
  expect.fail("Should have thrown");
} catch (e) {
  expect(e).toBeInstanceOf(ConvexError);
  expect((e as ConvexError<{ code: string }>).data.code).toBe("EXPECTED_CODE");
}
```

## Files to Create/Modify
- **Modify**: `convex/ledger/__tests__/ledger.test.ts` (update postEntry references)
- **Create**: `convex/ledger/__tests__/postEntry.test.ts`
