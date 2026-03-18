# Chunk 3 Context: End-to-End Lifecycle Tests

## What This Chunk Does
Implements 4 end-to-end lifecycle tests that exercise the complete payment flow from mortgage seeding through obligation settlement and mortgage lifecycle updates.

## Shared Setup Pattern
All E2E tests follow this pattern:
1. `createGovernedTestConvex()` + `seedDefaultGovernedActors(t)`
2. Seed mortgage (active, with payment terms)
3. Seed borrower profile
4. Seed obligation(s) (due or upcoming, linked to mortgage)
5. Seed plan entry + collection attempt
6. Fire transitions + invoke effects to drive the lifecycle

**Use helpers from** `src/test/convex/payments/helpers.ts` (created in Chunk 2).

## T-014: AC4 — ManualPaymentMethod Full Lifecycle

Test: `seed → obligation due → plan entry → attempt initiated → FUNDS_SETTLED → confirmed → PAYMENT_APPLIED → obligation settled → PAYMENT_CONFIRMED → mortgage active`

**Setup:**
1. Seed mortgage (active, machineContext: {missedPayments: 0, lastPaymentAt: 0})
2. Seed borrower
3. Seed obligation (status: "due", amount: 300_000, amountSettled: 0)
4. Seed plan entry (planned, obligationIds=[obligationId], method="manual", amount=300_000)
5. Seed attempt (initiated, planEntryId, method="manual", amount=300_000, machineContext={attemptId:"", retryCount:0, maxRetries:3})

**Execution:**
1. Fire FUNDS_SETTLED on attempt → confirmed (ManualPaymentMethod immediate path)
2. Invoke emitPaymentReceived effect → fires PAYMENT_APPLIED to obligation
3. Obligation should transition to "settled" (full amount: 300_000 >= 300_000)
4. Invoke applyPayment effect → amountSettled = 300_000
5. Invoke emitObligationSettled effect → fires PAYMENT_CONFIRMED to mortgage
6. Mortgage stays "active" (it was already active, not delinquent)

**Assertions:**
- Attempt status: "confirmed"
- Obligation status: "settled"
- Obligation amountSettled: 300_000
- Mortgage status: "active"
- Audit journal: 1 entry for attempt (initiated→confirmed), 1 for obligation (due→settled)

## T-015: AC5 — MockPADMethod Async Path

Test: Same lifecycle but with async `pending` state

**Setup:** Same as AC4 but with method="mock_pad"

**Execution:**
1. Fire DRAW_INITIATED on attempt → pending (async path, providerRef: "mock-pad-ref")
   - Assert: status = "pending"
   - Invoke recordProviderRef effect
2. Fire FUNDS_SETTLED on attempt → confirmed
   - Assert: status = "confirmed"
3. Same effect chain as AC4 (emitPaymentReceived → PAYMENT_APPLIED → applyPayment → emitObligationSettled)

**Key difference from AC4:** The attempt goes through `initiated → pending → confirmed` (3 states) instead of `initiated → confirmed` (2 states).

## T-016: AC6 — Partial Payment Accumulation

Test: `partial payment → partially_settled → second payment → settled`

**Setup:**
1. Seed mortgage + borrower
2. Seed obligation (status: "due", amount: 300_000, amountSettled: 0)

**Execution:**
1. First partial payment: fire PAYMENT_APPLIED with amount=150_000
   ```typescript
   fireTransition(t, "obligation", obligationId, "PAYMENT_APPLIED", {
     amount: 150_000,
     attemptId: "attempt_partial_1",
     currentAmountSettled: 0,      // currently 0
     totalAmount: 300_000,         // total due
   })
   ```
   - Guard: `isFullySettled` → 0 + 150_000 < 300_000 → false → `partially_settled`
   - Assert: status = "partially_settled"
   - effectsScheduled should include "applyPayment" but NOT "emitObligationSettled"

2. Invoke applyPayment with amount=150_000:
   ```typescript
   await t.mutation(applyPaymentRef, buildEffectArgs(obligationId, "obligation", "applyPayment", { amount: 150_000 }));
   ```
   - Assert: obligation.amountSettled = 150_000

3. Second payment: fire PAYMENT_APPLIED with amount=150_000
   ```typescript
   fireTransition(t, "obligation", obligationId, "PAYMENT_APPLIED", {
     amount: 150_000,
     attemptId: "attempt_partial_2",
     currentAmountSettled: 150_000,  // now 150_000 after first payment
     totalAmount: 300_000,
   })
   ```
   - Guard: `isFullySettled` → 150_000 + 150_000 >= 300_000 → true → `settled`
   - Assert: status = "settled"
   - effectsScheduled should include "applyPayment" AND "emitObligationSettled"

4. Invoke applyPayment with amount=150_000:
   - Assert: obligation.amountSettled = 300_000

5. Invoke emitObligationSettled:
   - Assert: mortgage receives PAYMENT_CONFIRMED

**Critical**: The `currentAmountSettled` in the PAYMENT_APPLIED payload must reflect the obligation's CURRENT amountSettled at the time of the event (after previous applyPayment effects have run). The guard relies on this value.

## T-017: AC7 — Retry Chain to Eventual Success

Test: `attempt fails → RetryRule → new attempt → succeeds → obligation settles`

**Setup:**
1. Seed mortgage + borrower + obligation (due)
2. Seed collection rules (retry_rule enabled, maxRetries=3, backoffBaseDays=3)
3. Seed plan entry + attempt (initiated)

**Execution:**
1. Fire DRAW_INITIATED → pending
2. Fire DRAW_FAILED → failed (retryCount increments to 1 via assign action)
3. Fire MAX_RETRIES_EXCEEDED → permanent_fail
   - effectsScheduled: emitCollectionFailed, notifyAdmin
4. Invoke emitCollectionFailed effect → schedules evaluateRules
5. Drain scheduled work → RetryRule creates new plan entry
   - Assert: new plan entry with source="retry_rule", rescheduledFromId=originalPlanEntryId

6. Seed NEW collection attempt for the retry plan entry
   ```typescript
   const retryAttemptId = await seedCollectionAttempt(t, {
     planEntryId: retryPlanEntryId,
     method: "manual",
     amount: 300_000,
   });
   ```

7. Fire FUNDS_SETTLED on retry attempt → confirmed
8. Invoke emitPaymentReceived → PAYMENT_APPLIED to obligation
9. Invoke applyPayment → amountSettled = 300_000
10. Invoke emitObligationSettled → PAYMENT_CONFIRMED to mortgage

**Assertions:**
- First attempt: permanent_fail
- Retry plan entry exists with correct source and backoff date
- Retry attempt: confirmed
- Obligation: settled
- Mortgage: active

**Backoff verification:**
```typescript
const MS_PER_DAY = 86_400_000;
// retryCount=1 after DRAW_FAILED increments the counter
// delay = 3 * 2^1 * MS_PER_DAY = 6 days
expect(retryPlanEntry.scheduledDate).toBeGreaterThanOrEqual(Date.now() + 6 * MS_PER_DAY - 1000);
expect(retryPlanEntry.scheduledDate).toBeLessThanOrEqual(Date.now() + 6 * MS_PER_DAY + 1000);
```

## T-018: Final Quality Gate
```typescript
const MS_PER_DAY = 86_400_000;
// retryCount=1 after DRAW_FAILED increments the counter
// delay = 3 * 2^1 * MS_PER_DAY = 6 days
expect(retryPlanEntry.scheduledDate).toBeGreaterThanOrEqual(Date.now() + 6 * MS_PER_DAY - 1000);
expect(retryPlanEntry.scheduledDate).toBeLessThanOrEqual(Date.now() + 6 * MS_PER_DAY + 1000);
```
// retryCount=1 after DRAW_FAILED increments the counter
// delay = 3 * 2^1 * MS_PER_DAY = 6 days
expect(retryPlanEntry.scheduledDate).toBeGreaterThanOrEqual(Date.now() + 6 * MS_PER_DAY - 1000);
```
// delay = 3 * 2^0 * MS_PER_DAY = 3 days
expect(retryPlanEntry.scheduledDate).toBeGreaterThanOrEqual(Date.now() + 3 * MS_PER_DAY - 1000);
expect(retryPlanEntry.scheduledDate).toBeLessThanOrEqual(Date.now() + 3 * MS_PER_DAY + 1000);
```

## T-018: Final Quality Gate

```bash
bunx convex codegen
bun typecheck
bun check
bun run test -- src/test/convex/payments/crossEntity.test.ts
bun run test -- src/test/convex/payments/endToEnd.test.ts
```

All must pass.

## Key Schema Reminders

### collectionAttempts table
```typescript
{
  status: string,              // GT field
  machineContext: any,         // GT field — {attemptId, retryCount, maxRetries}
  lastTransitionAt: number,    // GT field
  planEntryId: Id<"collectionPlanEntries">,
  method: string,              // "manual", "mock_pad"
  amount: number,              // cents
  providerRef?: string,
  providerStatus?: string,
  providerData?: any,
  initiatedAt: number,
  settledAt?: number,
  failedAt?: number,
  failureReason?: string,
}
```

### obligations table
```typescript
{
  status: string,              // GT field — "upcoming"|"due"|"overdue"|"partially_settled"|"settled"|"waived"
  machineContext: any,         // GT field
  lastTransitionAt: number,    // GT field
  mortgageId: Id<"mortgages">,
  borrowerId: Id<"borrowers">,
  paymentNumber: number,
  type: "regular_interest"|"arrears_cure"|"late_fee"|"principal_repayment",
  amount: number,              // cents
  amountSettled: number,       // cents, cumulative
  dueDate: number,
  gracePeriodEnd: number,
  sourceObligationId?: Id<"obligations">,
  settledAt?: number,
  createdAt: number,
}
```

### mortgages GT fields
```typescript
{
  status: string,              // "active"|"delinquent"|"defaulted"|"collections"|"written_off"|"matured"
  machineContext: { missedPayments: number, lastPaymentAt: number },
  // ... domain fields
}
```

## Effect Invocation Pattern (Critical)
Tests invoke effects MANUALLY. The transition engine schedules effects but doesn't execute them inline. The test must:
1. Fire transition → get `result.effectsScheduled`
2. For each scheduled effect, call `t.mutation(effectRef, buildEffectArgs(...))`
3. Each effect may fire additional transitions that schedule more effects
4. Repeat until all effect chains are resolved

For effects that use `ctx.scheduler.runAfter(0, ...)` (like emitCollectionFailed → evaluateRules), use:
```typescript
await t.finishAllScheduledFunctions(() => vi.runAllTimers());
```
