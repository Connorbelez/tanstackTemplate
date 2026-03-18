# Chunk 2 Context: Machine Verification

## SPEC §3.1 — Obligation Machine Definition
```typescript
obligationMachine = setup({
  types: {
    context: {} as { obligationId: string; paymentsApplied: number },
    events: {} as
      | { type: "BECAME_DUE" }
      | { type: "GRACE_PERIOD_EXPIRED" }
      | { type: "PAYMENT_APPLIED"; amount: number; attemptId: string }
      | { type: "OBLIGATION_WAIVED"; reason: string; approvedBy: string },
  },
  guards: {
    isFullySettled: ({ event }) => {
      return event.currentAmountSettled + event.amount >= event.totalAmount;
    },
  },
}).createMachine({
  id: "obligation",
  initial: "upcoming",
  states: {
    upcoming: {
      on: { BECAME_DUE: { target: "due" } },
    },
    due: {
      on: {
        GRACE_PERIOD_EXPIRED: {
          target: "overdue",
          actions: ["emitObligationOverdue", "createLateFeeObligation"],
        },
        PAYMENT_APPLIED: [
          { target: "settled", guard: "isFullySettled", actions: ["applyPayment", "emitObligationSettled"] },
          { target: "partially_settled", actions: ["applyPayment"] },
        ],
        OBLIGATION_WAIVED: { target: "waived", actions: ["recordWaiver"] },
      },
    },
    overdue: {
      on: {
        PAYMENT_APPLIED: [
          { target: "settled", guard: "isFullySettled", actions: ["applyPayment", "emitObligationSettled"] },
          { target: "partially_settled", actions: ["applyPayment"] },
        ],
        OBLIGATION_WAIVED: { target: "waived", actions: ["recordWaiver"] },
      },
    },
    partially_settled: {
      on: {
        PAYMENT_APPLIED: [
          { target: "settled", guard: "isFullySettled", actions: ["applyPayment", "emitObligationSettled"] },
          { target: "partially_settled", actions: ["applyPayment"] },
        ],
        GRACE_PERIOD_EXPIRED: {
          target: "overdue",
          actions: ["emitObligationOverdue"],
        },
      },
    },
    settled: { type: "final" },
    waived: { type: "final" },
  },
});
```

### Key Points for Verification:
- 6 states: upcoming, due, overdue, partially_settled, settled, waived
- 4 events: BECAME_DUE, GRACE_PERIOD_EXPIRED, PAYMENT_APPLIED, OBLIGATION_WAIVED
- Matrix: 6 × 4 = 24 test cases minimum
- `isFullySettled` guard checks `currentAmountSettled + amount >= totalAmount`
- OBLIGATION_WAIVED from `upcoming` is an accepted enhancement (not in original SPEC but valid)
- Terminal states: settled, waived
- `partially_settled` can still receive GRACE_PERIOD_EXPIRED → overdue

## SPEC §4.1 — Collection Attempt Machine Definition
```typescript
collectionAttemptMachine = setup({
  types: {
    context: {} as { attemptId: string; retryCount: number; maxRetries: number },
    events: {} as
      | { type: "DRAW_INITIATED"; providerRef: string }
      | { type: "PROVIDER_ACKNOWLEDGED"; providerRef: string }
      | { type: "FUNDS_SETTLED"; settledAt: number }
      | { type: "DRAW_FAILED"; reason: string; code: string }
      | { type: "RETRY_ELIGIBLE" }
      | { type: "MAX_RETRIES_EXCEEDED" }
      | { type: "RETRY_INITIATED"; providerRef: string }
      | { type: "ATTEMPT_CANCELLED"; reason: string },
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < context.maxRetries,
  },
}).createMachine({
  id: "collectionAttempt",
  initial: "initiated",
  states: {
    initiated: {
      on: {
        DRAW_INITIATED: { target: "pending", actions: ["recordProviderRef"] },
        FUNDS_SETTLED: { target: "confirmed", actions: ["emitPaymentReceived"] },
        ATTEMPT_CANCELLED: { target: "cancelled" },
      },
    },
    pending: {
      on: {
        FUNDS_SETTLED: { target: "confirmed", actions: ["emitPaymentReceived"] },
        DRAW_FAILED: { target: "failed", actions: ["incrementRetryCount"] },
      },
    },
    failed: {
      on: {
        RETRY_ELIGIBLE: { target: "retry_scheduled", guard: "canRetry", actions: ["scheduleRetryEntry"] },
        MAX_RETRIES_EXCEEDED: { target: "permanent_fail", actions: ["emitCollectionFailed", "notifyAdmin"] },
      },
    },
    retry_scheduled: {
      on: {
        RETRY_INITIATED: { target: "pending", actions: ["recordProviderRef"] },
      },
    },
    confirmed: { type: "final" },
    permanent_fail: { type: "final" },
    cancelled: { type: "final" },
  },
});
```

### Key Points for Verification:
- 7 states: initiated, pending, failed, retry_scheduled, confirmed, permanent_fail, cancelled
- 8 events: DRAW_INITIATED, PROVIDER_ACKNOWLEDGED, FUNDS_SETTLED, DRAW_FAILED, RETRY_ELIGIBLE, MAX_RETRIES_EXCEEDED, RETRY_INITIATED, ATTEMPT_CANCELLED
- Matrix: 7 × 8 = 56 test cases minimum
- ManualPaymentMethod path: initiated → confirmed (via FUNDS_SETTLED, skips pending)
- MockPADMethod path: initiated → pending (via DRAW_INITIATED) → confirmed (via FUNDS_SETTLED)
- Retry path: pending → failed → retry_scheduled → pending
- canRetry guard: retryCount < maxRetries
- Terminal states: confirmed, permanent_fail, cancelled
- PROVIDER_ACKNOWLEDGED is declared in events but NOT used in any state transition — verify if this is intentional or a gap
