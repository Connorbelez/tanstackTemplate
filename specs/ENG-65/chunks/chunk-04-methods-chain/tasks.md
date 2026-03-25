# Chunk 4: Methods + Cross-Entity Chain Verification (DoD #5, #6, #9, #10, #11, #14)

## Tasks

### T-017: DoD #5 — Verify ManualPaymentMethod works E2E
- Read `convex/payments/methods/manual.ts`
- Verify: `initiate()` returns `{ providerRef: "manual-...", status: "confirmed" }`
- Verify: `confirm()` returns settledAt timestamp
- Verify: The E2E flow works: plan entry → attempt created → ManualPaymentMethod.initiate() → FUNDS_SETTLED → confirmed → obligation settles
- Check endToEnd tests for ManualPaymentMethod flow

### T-018: DoD #6 — Verify MockPADMethod works
- Read `convex/payments/methods/mockPAD.ts`
- Verify: `initiate()` returns `{ status: "pending" }` (async path)
- Verify: Configurable delay and failure rate
- Verify: Scheduled function fires FUNDS_SETTLED or DRAW_FAILED after delay
- Check methods tests for MockPADMethod coverage

### T-019: DoD #9 — Verify cross-machine chain (3 audit entries)
- Read `convex/payments/__tests__/crossEntity.test.ts`
- Verify the full chain test exists:
  1. Collection Attempt: initiated → confirmed (FUNDS_SETTLED)
  2. Obligation: PAYMENT_APPLIED → settled
  3. Mortgage: OBLIGATION_SETTLED → cure check
- Verify 3 audit journal entries with causal chain
- Run the test:
```bash
bun run test convex/payments/__tests__/crossEntity.test.ts
```

### T-020: DoD #10 — Verify OBLIGATION_OVERDUE fires to Mortgage
- Read `convex/engine/effects/obligation.ts` (emitObligationOverdue)
- Verify: fires OBLIGATION_OVERDUE to mortgage machine
- Verify: triggers rules engine evaluation (not stub)
- Check crossEntity tests for overdue chain test

### T-021: DoD #11 — Verify partial settlement
- Read endToEnd tests for partial payment flow
- Verify: Two payments against one obligation → amountSettled accumulates
- Verify: First payment → partially_settled, second payment (remainder) → settled

### T-022: DoD #14 — Verify PaymentMethod interface cleanliness
- Read `convex/payments/methods/interface.ts`
- Verify: Interface defines `initiate()`, `confirm()`, `cancel()`, `getStatus()`
- Read `convex/payments/methods/registry.ts`
- Verify: Adding RotessaPADMethod requires:
  - One new class implementing PaymentMethod
  - One new case in registry
  - Zero changes to machines, rules, effects, or schema
- Check that no payment method implementation leaks into machine definitions or effect handlers

### T-023: Run all methods + chain tests
```bash
bun run test convex/payments/__tests__/methods.test.ts
bun run test convex/payments/__tests__/crossEntity.test.ts
bun run test convex/payments/__tests__/endToEnd.test.ts
```
- All must pass
