# Chunk 2 Context: Lifecycle + Point-in-Time Tests

## Test harness pattern (from testUtils.ts)

```typescript
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import {
  SYS_SOURCE,
  asLedgerUser,
  createTestHarness,
  executeCommitReservation,
  executeReserveShares,
  executeVoidReservation,
  getAccount,
  getConvexErrorCode,
  initCounter,
  mintAndIssue,
  mintAndIssueMultiple,
} from "./testUtils";
```

## Key API functions available

### Write mutations
- `api.ledger.mutations.mintAndIssue` — atomic mint + allocations (ledgerMutation)
  - Args: `{ mortgageId, allocations: [{lenderId, amount}], effectiveDate, idempotencyKey, source }`
- `api.ledger.mutations.mintMortgage` — mint only (adminMutation)
- `api.ledger.mutations.transferShares` — POSITION→POSITION (ledgerMutation)
  - Args: `{ mortgageId, sellerLenderId, buyerLenderId, amount, effectiveDate, idempotencyKey, source }`
- `api.ledger.mutations.redeemShares` — POSITION→TREASURY (ledgerMutation)
  - Args: `{ mortgageId, lenderId, amount, effectiveDate, idempotencyKey, source }`
- `api.ledger.mutations.burnMortgage` — TREASURY→WORLD (adminMutation)
  - Args: `{ mortgageId, effectiveDate, idempotencyKey, source, reason }`
- `api.ledger.mutations.postCorrection` — CORRECTION (adminMutation) — ADDED IN CHUNK 1

### Internal mutations (via testUtils execute helpers)
- `executeReserveShares(t, args)` — locks pending fields
- `executeCommitReservation(t, args)` — pending→posted
- `executeVoidReservation(t, args)` — releases pending

### Read queries
- `api.ledger.queries.validateSupplyInvariant` — `{ mortgageId }` → `{ valid, treasury, positions, total }`
- `api.ledger.queries.getBalance` — `{ accountId }` → bigint
- `api.ledger.queries.getPositions` — `{ mortgageId }` → `[{ lenderId, accountId, balance }]`
- `api.ledger.queries.getBalanceAt` — `{ accountId, asOf: number }` → bigint (timestamp-based replay)
- `api.ledger.queries.getPositionsAt` — `{ mortgageId, asOf: number }` → `[{ lenderId, balance }]`

## getPositionsAt implementation details (queries.ts:200-263)

- Fetches entries via `by_mortgage_and_time` index with `lte("timestamp", args.asOf)`
- Sorts by sequenceNumber for same-millisecond determinism
- Skips AUDIT_ONLY entries (SHARES_RESERVED, SHARES_VOIDED) — no balance change
- SHARES_COMMITTED IS counted (not in AUDIT_ONLY set)
- Returns only POSITION accounts with balance > 0

## getBalanceAt implementation details (queries.ts:157-198)

- Fetches debit/credit entries via `by_debit_account`/`by_credit_account` indexes
- Skips AUDIT_ONLY entries
- Returns computed balance as bigint

## Timestamp handling in tests

Journal entries have a `timestamp` field set to `Date.now()` at write time. For point-in-time tests:
- Read the timestamp from journal entries after they're created
- Use timestamps slightly before/after entry timestamps for boundary testing
- convex-test runs synchronously so timestamps may be very close together

## AUDIT_ONLY_ENTRY_TYPES (constants.ts:29-32)
```typescript
export const AUDIT_ONLY_ENTRY_TYPES: ReadonlySet<string> = new Set([
  "SHARES_RESERVED",
  "SHARES_VOIDED",
]);
```
Note: SHARES_COMMITTED is NOT audit-only — it updates cumulatives.

## Helper pattern for getting timestamps

```typescript
// After a mutation, read the journal entry to get its timestamp
const entry = await t.run(async (ctx) =>
  ctx.db.query("ledger_journal_entries")
    .withIndex("by_idempotency", q => q.eq("idempotencyKey", "some-key"))
    .first()
);
const t0 = entry?.timestamp ?? 0;
```

## Available balance vs posted balance (accounts.ts)
- `getPostedBalance(account)` = cumulativeDebits - cumulativeCredits
- `getAvailableBalance(account)` = posted - pendingCredits

## File paths
- Create: `convex/ledger/__tests__/lifecycle.test.ts`
- Create: `convex/ledger/__tests__/pointInTime.test.ts`
- Read-only: `convex/ledger/__tests__/testUtils.ts`, `convex/ledger/queries.ts`
