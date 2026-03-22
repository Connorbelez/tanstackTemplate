# Chunk 04 Context: Financial Invariant Tests

## Goal
Create `convex/payments/cashLedger/__tests__/financialInvariants.test.ts` — tests for the 8 key invariants from the Notion Goal and Tech Design.

## File to Create
`convex/payments/cashLedger/__tests__/financialInvariants.test.ts`

## Invariants to Test

### INV-1: CONTROL:ALLOCATION Net-Zero Per Posting Group
**From Goal:** "For each CONTROL subaccount within a completed posting group (postingGroupId), the net balance of that group must be zero."

Implementation: Use `postCashEntryInternal` to create a full dispersal allocation group:
1. LENDER_PAYABLE_CREATED (debit CONTROL:ALLOCATION, credit LENDER_PAYABLE) — per lender
2. SERVICING_FEE_RECOGNIZED (debit CONTROL:ALLOCATION, credit SERVICING_REVENUE)

Then verify via querying journal entries by postingGroupId and summing CONTROL amounts.

The `getControlBalancesByPostingGroup` function from `reconciliation.ts` can be used — it queries entries by postingGroupId and sums CONTROL account debits/credits.

Test scenarios:
- Complete group (2 lender payables + 1 fee = 3 entries): nets to zero
- Incomplete group (1 of 2 lender payables): non-zero CONTROL balance
- Multiple posting groups: independent net-zero checks

### INV-2: Non-Negative LENDER_PAYABLE
**From Goal:** "No payout or adjustment may reduce a lender's LENDER_PAYABLE balance below zero."

LENDER_PAYABLE is credit-normal. Balance = credits - debits. A LENDER_PAYOUT_SENT debits LENDER_PAYABLE.

Test scenarios:
- Post LENDER_PAYOUT_SENT with amount > payable balance → should throw negative balance error
- Post REVERSAL entry debiting LENDER_PAYABLE → should succeed (REVERSAL skips balance check)

Setup: Create LENDER_PAYABLE account with some credit balance, TRUST_CASH with some debit balance.

### INV-3: Point-in-Time Reconstruction Matches Running Balances
**From Goal:** "Point-in-time reconstruction uses sequenceNumber as canonical replay order."

The `getAccountBalanceAt` query replays entries up to a given timestamp, sorted by sequenceNumber.

Test approach:
1. Post multiple entries to an account
2. Compare `getCashAccountBalance(account)` (running total from cumulative fields) with `getAccountBalanceAt(accountId, Date.now())` (replay from journal entries)
3. They must match

Also test same-timestamp entries: post 2+ entries within the same `t.run` (same timestamp), verify they replay in ascending sequenceNumber order.

Note: `getAccountBalanceAt` is an authed query (cashLedgerQuery). Use `t.withIdentity(ADMIN_IDENTITY).query(api.path, args)` or call the internal function directly inside `t.run`.

Actually, looking at the code, `getAccountBalanceAt` uses `cashLedgerQuery` middleware which requires auth. For testing, use `t.run` to directly compute the point-in-time balance using the same logic.

### INV-4: Idempotent Replay
**From Goal:** "Posting same entries twice produces same state."

Test approach:
1. Post a sequence of entries with unique idempotency keys
2. Snapshot all account balances and entry count
3. Post the same sequence again (same idempotency keys)
4. Verify: all balances unchanged, no new entries created, second post returns existing entries

### INV-5: Append-Only Correction
**From Goal:** "No money journal entry is ever mutated or deleted after posting. Corrections are new entries with causedBy referencing the original."

Test approach:
1. Post an original entry (e.g., OBLIGATION_ACCRUED)
2. Snapshot the original entry
3. Post a CORRECTION referencing the original via causedBy
4. Verify: original entry is unchanged (same fields), CORRECTION is a new entry with its own ID
5. Same for REVERSAL

### INV-6: Reversal Traceability
**From Goal:** "Every REVERSAL entry must have a causedBy reference to the original entry being reversed."

Test approach:
1. Post a REVERSAL with valid causedBy → succeeds
2. Verify `result.entry.causedBy` references a valid existing journal entry
3. Load the causedBy entry and verify it exists

## Import Pattern
```typescript
import { describe, expect, it } from "vitest";
import { postCashEntryInternal, type PostCashEntryInput } from "../postEntry";
import { getOrCreateCashAccount, getCashAccountBalance } from "../accounts";
import { createHarness, SYSTEM_SOURCE, ADMIN_SOURCE, ADMIN_IDENTITY, type TestHarness } from "./testUtils.test";
```

## Balance Check Behavior for Relevant Entry Types
- LENDER_PAYOUT_SENT: debits LENDER_PAYABLE (credit-normal), credits TRUST_CASH (debit-normal) — both are NON-exempt, so balance check applies
- REVERSAL: skips balance check entirely
- CORRECTION: skips balance check entirely

## Key Function: getAccountBalanceAt
```typescript
// Loads entries by debit_account and credit_account up to asOf timestamp
// Sorts by sequenceNumber
// Replays balance: debit entries add/subtract based on credit-normal convention
// Returns bigint balance
```

## Reconciliation Functions Available
- `getControlBalancesByPostingGroup(ctx, postingGroupId)` — returns CONTROL account balances within a posting group
- `reconcileObligationSettlementProjectionInternal(ctx, obligationId)` — drift detection
