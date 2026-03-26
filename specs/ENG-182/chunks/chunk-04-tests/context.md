# Chunk 04 Context: Tests

## Testing Stack

- **Vitest** for test runner
- **convex-test** for Convex function testing (provides `convexTest` harness)
- Tests live in `__tests__/` directories adjacent to the code they test
- Run with: `bun run test`

## T-011: Config Unit Tests

### File: `convex/payments/payout/__tests__/config.test.ts` (NEW)

Pure function tests — no Convex harness needed.

**Test cases for `isPayoutDue(frequency, lastPayoutDate, today)`:**

1. **Monthly — due after 28+ days**: `isPayoutDue("monthly", "2026-02-01", "2026-03-01")` → `true`
2. **Monthly — not due before 28 days**: `isPayoutDue("monthly", "2026-03-10", "2026-03-25")` → `false`
3. **Weekly — due after 7+ days**: `isPayoutDue("weekly", "2026-03-01", "2026-03-08")` → `true`
4. **Weekly — not due before 7 days**: `isPayoutDue("weekly", "2026-03-01", "2026-03-05")` → `false`
5. **Bi-weekly — due after 14+ days**: `isPayoutDue("bi_weekly", "2026-03-01", "2026-03-15")` → `true`
6. **Bi-weekly — not due before 14 days**: `isPayoutDue("bi_weekly", "2026-03-01", "2026-03-10")` → `false`
7. **On-demand — never due via cron**: `isPayoutDue("on_demand", undefined, "2026-03-15")` → `false`
8. **Never paid out — always due**: `isPayoutDue("monthly", undefined, "2026-03-15")` → `true`
9. **Never paid out + weekly — due**: `isPayoutDue("weekly", undefined, "2026-03-15")` → `true`
10. **Exactly 28 days — due**: `isPayoutDue("monthly", "2026-02-26", "2026-03-26")` → `true`
11. **Exactly 7 days — due**: `isPayoutDue("weekly", "2026-03-19", "2026-03-26")` → `true`

Also test constants:
- `DEFAULT_PAYOUT_FREQUENCY === "monthly"`
- `MINIMUM_PAYOUT_CENTS === 100`

## T-012: Batch Payout Integration Tests

### File: `convex/payments/payout/__tests__/batchPayout.test.ts` (NEW)

These require the full Convex test harness (`convex-test`).

**Look at existing test patterns** in:
- `convex/payments/cashLedger/__tests__/e2eLifecycle.test.ts` — for end-to-end cash ledger testing patterns
- `convex/payments/cashLedger/__tests__/disbursementGate.test.ts` — for postLenderPayout testing patterns

**Test setup helper needs:**
1. Seed a lender (active status)
2. Seed a mortgage
3. Seed dispersal entries with `status: "pending"` and `payoutEligibleAfter` in the past
4. Seed required cash ledger accounts (LENDER_PAYABLE, TRUST_CASH)
5. Seed LENDER_PAYABLE_CREATED journal entries to create payable balance

**Test cases:**
1. **Happy path: monthly lender with eligible entries → payout posted**
   - Seed lender with `payoutFrequency: "monthly"`, no `lastPayoutDate`
   - Seed 2 dispersal entries (past hold) for different obligations under same mortgage
   - Run `processPayoutBatch`
   - Assert: LENDER_PAYOUT_SENT journal entry created with correct total amount
   - Assert: dispersal entries status changed to `disbursed`
   - Assert: lender's `lastPayoutDate` updated

2. **Hold period respected: entries within hold are skipped**
   - Seed entry with `payoutEligibleAfter` in the future
   - Run batch
   - Assert: no payout posted

3. **Minimum threshold: sub-threshold balances not paid out**
   - Seed entry with amount = 50 cents (below MINIMUM_PAYOUT_CENTS = 100)
   - Run batch
   - Assert: no payout posted, entry still `pending`

4. **Multi-mortgage: separate payouts per mortgage**
   - Seed entries under 2 different mortgages
   - Run batch
   - Assert: 2 separate LENDER_PAYOUT_SENT entries created

5. **Frequency not met: recently paid lender skipped**
   - Set `lastPayoutDate` to yesterday, frequency = `monthly`
   - Run batch
   - Assert: no payout posted

6. **On-demand lender: skipped by cron**
   - Set `payoutFrequency: "on_demand"`
   - Run batch
   - Assert: no payout posted

7. **Idempotency: running batch twice on same day is safe**
   - Run batch, then run again
   - Assert: only one set of journal entries (second run is no-op via idempotency keys)

## T-013: Admin Payout Integration Tests

### File: `convex/payments/payout/__tests__/adminPayout.test.ts` (NEW)

**Test cases:**
1. **Admin triggers immediate payout for on-demand lender**
   - Seed on-demand lender with eligible entries
   - Call `triggerImmediatePayout`
   - Assert: payout posted, entries disbursed

2. **Hold period still respected even with admin trigger**
   - Seed entry with future `payoutEligibleAfter`
   - Call `triggerImmediatePayout`
   - Assert: that entry is NOT included in payout

3. **Admin payout scoped to specific mortgage**
   - Seed entries under 2 mortgages
   - Call with `mortgageId` specified
   - Assert: only entries for that mortgage are paid out

4. **Minimum threshold still applies**
   - Seed single entry below threshold
   - Assert: payout not posted (or discuss if admin should bypass threshold)

## Existing Test Patterns to Follow

**Test harness creation** (from existing tests):
```typescript
import { convexTest } from "convex-test";
import { modules } from "../../../test.setup"; // adjust path
```

**Seeding entities** — look for existing `seedMinimalEntities` or similar helpers in:
- `convex/payments/cashLedger/__tests__/testUtils.ts`
- `convex/payments/cashLedger/__tests__/e2eLifecycle.test.ts`

**Asserting journal entries:**
```typescript
const entries = await ctx.db
    .query("cash_ledger_journal_entries")
    .withIndex("by_lender", q => q.eq("lenderId", lenderId).eq("entryType", "LENDER_PAYOUT_SENT"))
    .collect();
expect(entries).toHaveLength(1);
expect(entries[0].amount).toBe(expectedAmountCents);
```

**Asserting dispersal entry status:**
```typescript
const entry = await ctx.db.get(dispersalEntryId);
expect(entry?.status).toBe("disbursed");
```
