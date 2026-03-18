# Chunk 3: Generation + Rules Verification (DoD #3, #4, #7, #8)

## Tasks

### T-011: DoD #3 — Verify obligation generation logic
- Read `convex/payments/obligations/generate.ts`
- Verify:
  - Monthly mortgage: 12 obligations/year, amount = interestRate × principal ÷ 12 (in cents)
  - Bi-weekly mortgage: 26 obligations/year, amount = interestRate × principal ÷ 26
  - Weekly mortgage: 52 obligations/year
  - Grace period = dueDate + gracePeriodDays (default 15 days)
  - Each obligation created with status "upcoming", amountSettled 0
  - machineContext includes obligationId and paymentsApplied: 0

### T-012: DoD #3 — Run generation tests
```bash
bun run test convex/payments/__tests__/generation.test.ts
```
- Verify tests cover monthly, bi-weekly, weekly frequencies
- Verify grace period calculation tests
- Check for idempotency tests (calling generate twice doesn't duplicate)

### T-013: DoD #4 — Verify ScheduleRule
- Read `convex/payments/collectionPlan/rules/scheduleRule.ts`
- Verify:
  - Creates plan entry N days before due date (configurable via rule parameters)
  - Checks for existing plan entry before creating (no duplicates)
  - Uses borrower's preferred payment method (falls back to "manual")
  - Sets status "planned", source "default_schedule"

### T-014: DoD #7 — Verify RetryRule
- Read `convex/payments/collectionPlan/rules/retryRule.ts`
- Verify:
  - Only triggers on "COLLECTION_FAILED" event
  - Exponential backoff: backoffBase × 2^retryCount (default base: 3 days → 3, 6, 12)
  - Respects maxRetries (default 3)
  - Creates new plan entry with source "retry_rule", links to rescheduledFromId

### T-015: DoD #8 — Verify LateFeeeRule
- Read `convex/payments/collectionPlan/rules/lateFeeRule.ts`
- Verify:
  - Only triggers on "OBLIGATION_OVERDUE" event
  - Creates a new late_fee obligation with configurable fee amount (default $50 = 5000 cents)
  - Idempotency: checks for existing late fee for same sourceObligationId
  - Late fee has its own due date (30 days) and grace period (45 days)

### T-016: Run rules tests
```bash
bun run test convex/payments/__tests__/rules.test.ts
```
- Verify all three rules have test coverage
- Check for duplicate prevention tests
- Check for priority ordering tests
- Check for disabled rules being skipped
