# Chunk 3 Context: Generation + Rules Verification

## SPEC §7 — Obligation Generation
```typescript
// payments/obligations/generate.ts
export const generateObligations = internalMutation({
  args: { mortgageId: v.id("mortgages") },
  handler: async (ctx, args) => {
    const mortgage = await ctx.db.get(args.mortgageId);
    const { interestRate, principalBalance, paymentFrequency, firstPaymentDate, termEndDate } = mortgage;

    const periodsPerYear = paymentFrequency === "monthly" ? 12
      : paymentFrequency === "bi_weekly" ? 26
      : paymentFrequency === "weekly" ? 52 : 12;

    const periodInterest = Math.round((interestRate * principalBalance) / periodsPerYear);
    const gracePeriodDays = mortgage.gracePeriodDays ?? 15;

    // Generate one obligation per period from firstPaymentDate to termEndDate
    // Each obligation: status "upcoming", amount in cents, dueDate, gracePeriodEnd
  },
});
```

## SPEC §6 — Collection Plan Rules Engine

### §6.1 Rules Evaluation
- Rules loaded from `collectionRules` table, sorted by priority
- Each rule has a trigger type: "schedule" (cron) or "event" (state change)
- Rules evaluate conditions and produce actions (plan entry creation)

### §6.2 ScheduleRule
- Trigger: "schedule" (cron)
- Finds obligations becoming due within scheduling window (N days, default 5)
- Checks for existing plan entry (idempotent)
- Uses borrower's preferred payment method (mortgage.preferredPaymentMethod ?? "manual")
- Creates plan entry: status "planned", source "default_schedule"

### §6.3 RetryRule
- Trigger: "event" (COLLECTION_FAILED)
- Loads failed attempt, checks retry count vs maxRetries
- Exponential backoff: backoffBase × 2^retryCount (default base 3 days → 3, 6, 12 days)
- Creates plan entry: source "retry_rule", links rescheduledFromId

### §6.4 LateFeeeRule
- Trigger: "event" (OBLIGATION_OVERDUE)
- Creates new late_fee obligation (not a plan entry)
- Fee amount configurable (default 5000 cents = $50)
- Idempotency: checks existing late fee for same sourceObligationId
- Late fee obligation: dueDate = now + 30 days, gracePeriodEnd = now + 45 days

## Key Verification Points
- All amounts in cents (integer arithmetic, no floats)
- Grace period default: 15 days (Canadian mortgage standard)
- Backoff pattern: 3, 6, 12 days (not 3, 7, 14 as some docs say — verify which is implemented)
- LateFeeeRule creates an *obligation*, not a plan entry — it's a debt, not a collection action
