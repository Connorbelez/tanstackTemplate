# Chunk 03 Context: Tests

## What This Chunk Does
1. Update existing `ledger.test.ts` to use `postEntryDirect` (internalMutation) instead of the removed public `postEntry`
2. Create comprehensive `postEntry.test.ts` pipeline tests

## Existing Test Infrastructure

### Test Identity & Harness
```typescript
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

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

function createTestHarness() { return convexTest(schema, modules); }
function asLedgerUser(t) { return t.withIdentity(LEDGER_TEST_IDENTITY); }

const SYS_SOURCE = { type: "system" as const, channel: "test" };
const ADMIN_SOURCE = { type: "user" as const, actor: "admin-1", channel: "admin" };
```

### Key: initCounter is required before any ledger mutation
```typescript
async function initCounter(t: ReturnType<typeof createTestHarness>) {
  const auth = asLedgerUser(t);
  await auth.mutation(api.ledger.sequenceCounter.initializeSequenceCounter, {});
}
```

### Amount type: `number` (not bigint)
The validators use `v.number()`. Tests pass integer numbers (e.g., `10_000`, `5_000`).
Balance queries return `bigint` (from cumulative fields).

## Changes Needed in ledger.test.ts

### API → Internal migration
Tests calling `api.ledger.mutations.postEntry` must change to `internal.ledger.mutations.postEntryDirect`.

Add `internal` to the import:
```typescript
import { api, internal } from "../../_generated/api";
```

Affected test IDs: T-055, T-056, T-057, T-061, T-062, T-063, T-064, T-064b, T-064c, T-073, T-073b, T-073c, T-074, T-075, T-075b, T-075c

### Error message changes
Existing tests match error messages with regex like `/Seller post-transfer.*violates minimum position/`.
The new ConvexError-based pipeline will produce ConvexError objects, not plain Error strings.

However, `ConvexError` messages still appear in `.message` when thrown. The convex-test framework will surface them. Tests using `.rejects.toThrow(/regex/)` will still work if the ConvexError `.message` matches.

**Recommendation:** Keep regex-based assertions for existing tests. New tests should check ConvexError `.data.code` for precision:
```typescript
try {
  await auth.mutation(internal.ledger.mutations.postEntryDirect, args);
  expect.fail("Should have thrown");
} catch (e) {
  expect(e).toBeInstanceOf(ConvexError);
  expect((e as ConvexError<{ code: string }>).data.code).toBe("EXPECTED_CODE");
}
```

Note: In convex-test, ConvexError is re-thrown. Import `{ ConvexError }` from `"convex/values"`.

## New Test File: postEntry.test.ts

### Happy Paths (6 original types)
Test through convenience mutations (mintMortgage, issueShares, etc.) which call postEntry internally. Verify journal entries, balances, and sequence numbers.

### Happy Paths (3 reservation types)
Call `postEntryDirect` with SHARES_RESERVED, SHARES_COMMITTED, SHARES_VOIDED.
**Critical assertion**: For AUDIT_ONLY types (RESERVED, VOIDED), verify cumulativeDebits and cumulativeCredits are UNCHANGED after the entry.

### Rejection Tests (ConvexError codes)
- `INVALID_AMOUNT` — amount 0, -1, 0.5, NaN, Infinity, MAX_SAFE_INTEGER+1
- `SAME_ACCOUNT` — debitAccountId === creditAccountId
- `ACCOUNT_NOT_FOUND` — non-existent account ID
- `TYPE_MISMATCH` — wrong account types for entry type
- `INSUFFICIENT_BALANCE` — credit account available < amount
- `MIN_FRACTION_VIOLATED` — resulting POSITION between 1-999
- `MORTGAGE_MISMATCH` — cross-mortgage transfer/reservation
- `CORRECTION_REQUIRES_ADMIN` — non-admin source
- `CORRECTION_REQUIRES_CAUSED_BY` — missing causedBy
- `CORRECTION_REQUIRES_REASON` — missing reason

### Special Cases
- **Idempotency**: same key returns same entry, no side effects
- **Sequence monotonicity**: entries get 1, 2, 3...
- **Sell-all exception**: POSITION can go to exactly 0
- **WORLD exemption**: WORLD can go negative

## Files to Create/Modify
- **Modify**: `convex/ledger/__tests__/ledger.test.ts` (update postEntry references)
- **Create**: `convex/ledger/__tests__/postEntry.test.ts`
