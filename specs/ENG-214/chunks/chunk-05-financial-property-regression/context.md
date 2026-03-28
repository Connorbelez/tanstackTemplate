# Chunk 5 Context: Financial Property Tests & Regression Verification

## Goal
Write deterministic financial property tests that verify core money invariants hold across multiple scenarios. Then verify zero regression across the entire existing test suite.

## Financial Property Tests

These are NOT randomized property-based tests. They are deterministic tests with carefully chosen numeric edge cases that verify financial invariants.

### T-019: Dispersal Rounding Invariant

**Invariant:** Sum of rounded per-lender dispersal outputs MUST equal the total distributable amount. No cents lost or created by rounding.

**File to reference:** `convex/dispersal/createDispersalEntries.ts`

The dispersal engine:
1. Takes `settledAmount` (integer cents)
2. Deducts servicing fee
3. Distributes remainder pro-rata to lenders by ownership percentage
4. Each lender's share is rounded (Banker's rounding or floor)

**Test scenarios:**
- 3 lenders with equal 33.33% ownership → 1 cent remainder must be allocated deterministically
- 2 lenders with 50/50 → clean split
- 4 lenders with uneven shares (40/30/20/10) → verify sum matches
- Edge case: 1 cent total distributable → only one lender gets it
- Edge case: 0 cents distributable → all get 0
- Large amount: 10,000,000 cents ($100,000) with 7 lenders at varying shares

```typescript
// Verification pattern
const entries = await createDispersalEntries(ctx, { ... });
const totalDistributed = entries.reduce((sum, e) => sum + e.amount, 0);
expect(totalDistributed).toBe(distributableAmount);
```

### T-020: One Confirmation = One Posting

**Invariant:** A single FUNDS_SETTLED event on a transfer must produce exactly one cash ledger journal entry. Not zero, not two.

**Test scenarios:**
- Inbound manual transfer: initiated → confirmed → verify exactly 1 CASH_RECEIVED entry
- Outbound manual transfer: initiated → confirmed → verify exactly 1 LENDER_PAYOUT_SENT entry
- Bridge transfer: confirmed via bridge → verify exactly 0 entries from transfer path (D4 skip) + 1 from collection attempt path

```typescript
// Verification pattern
const entries = await ctx.db
  .query("cash_ledger_journal_entries")
  .withIndex("by_transfer_request", q => q.eq("transferRequestId", transferId))
  .collect();
expect(entries).toHaveLength(1); // exactly one
```

### T-021: Replayed Webhook = Zero Additional Postings

**Invariant:** Processing the same webhook event twice must not create a second cash ledger entry.

**Test scenarios:**
1. Create transfer in `pending` state
2. Fire FUNDS_SETTLED → transfer confirmed → cash entry created (1 entry)
3. Fire FUNDS_SETTLED again (simulating webhook replay)
   - Transfer is already in `confirmed` state (final-ish, only TRANSFER_REVERSED accepted)
   - XState transition should be a no-op (confirmed + FUNDS_SETTLED → stays confirmed)
4. Verify still exactly 1 cash ledger entry

This tests both the state machine (won't re-transition) and the idempotency key (won't re-post).

```typescript
// Use MockTransferProvider.simulateWebhook with explicit eventId
const eventId = "evt-replay-001";
const first = await provider.simulateWebhook(ref, "confirmed", eventId);
// Feed first through GT...
const second = await provider.simulateWebhook(ref, "confirmed", eventId);
// Feed second through GT...
// Verify: still 1 cash entry
```

### T-022: Reversal Net Effect = Zero

**Invariant:** After a confirmed transfer is reversed, the net effect on all accounts must be zero. The reversal entry must exactly cancel the original entry.

**Test scenarios:**
1. Create and confirm inbound transfer → CASH_RECEIVED (debit TRUST_CASH +50000, credit BORROWER_RECEIVABLE +50000)
2. Reverse the transfer → REVERSAL (debit BORROWER_RECEIVABLE +50000, credit TRUST_CASH +50000)
3. Verify: TRUST_CASH net = 0, BORROWER_RECEIVABLE net = 0

```typescript
// Verification pattern
const trustCashAccount = await getAccount(ctx, "TRUST_CASH", mortgageId);
const netBalance = Number(trustCashAccount.cumulativeDebits - trustCashAccount.cumulativeCredits);
// After reversal, net should be same as before the original posting
```

**Also test:**
- Outbound reversal: LENDER_PAYOUT_SENT → REVERSAL → LENDER_PAYABLE net = 0
- Amount mismatch: if settled amount differs from requested amount, reversal uses settled amount

## Regression Verification (T-023)

**Goal:** Verify that ALL existing tests pass with zero modification.

**Commands to run:**
```bash
bun run test                    # full test suite
bun check                      # lint + format
bun typecheck                  # TypeScript
bunx convex codegen            # schema validation
```

**Key test files that MUST pass unchanged:**
- `convex/payments/__tests__/methods.test.ts` — existing PaymentMethod tests
- `convex/payments/__tests__/generation.test.ts` — payment generation
- `convex/payments/__tests__/rules.test.ts` — collection rules
- `convex/payments/__tests__/crons.test.ts` — payment crons
- `convex/engine/effects/__tests__/*` — all engine effect tests
- `convex/payments/cashLedger/__tests__/*` — all 35+ cash ledger tests
- `convex/payments/transfers/__tests__/*` — all existing transfer tests
- `convex/dispersal/__tests__/*` — dispersal tests (if any)
- `convex/engine/machines/__tests__/*` — state machine tests (if any)

**What "unchanged" means:**
- No modifications to existing test files
- No modifications to existing source files that break existing tests
- New test files are additions only

## Test Output Files
- `convex/payments/transfers/__tests__/financialProperties.test.ts` — property invariant tests
- No new file needed for T-023 (it's a verification task, not a code task)

## Cash Ledger Account Balance Queries

**File:** `convex/payments/cashLedger/accounts.ts`

Key functions for balance verification:
- Account balance = `cumulativeDebits - cumulativeCredits` (stored as bigint on the account)
- Entries link to accounts via `debitAccountId` / `creditAccountId`

## Test Harness Pattern

Same as previous chunks:
```typescript
import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import schema from "../../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

function createHarness() {
  process.env.DISABLE_GT_HASHCHAIN = "true";
  const t = convexTest(schema, modules);
  auditLogTest.register(t, "auditLog");
  return t;
}
```

## Key Invariants Summary
1. **Rounding conservation:** Sum of parts = whole (no cents lost/created)
2. **Exactly-once posting:** One confirmation = one journal entry
3. **Replay safety:** Duplicate events = no additional effects
4. **Reversal completeness:** Reversal entry exactly cancels original
5. **Zero regression:** No existing test modified or broken
