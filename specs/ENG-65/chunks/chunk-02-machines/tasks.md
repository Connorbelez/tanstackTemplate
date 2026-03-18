# Chunk 2: Machine Verification (DoD #1, #2)

## Tasks

### T-006: DoD #1 — Cross-check obligation machine definition against SPEC §3.1
- Read `convex/engine/machines/obligation.machine.ts`
- Compare against SPEC §3.1 definition (in context below)
- Verify: 6 states (upcoming, due, overdue, partially_settled, settled, waived)
- Verify: 4 events (BECAME_DUE, GRACE_PERIOD_EXPIRED, PAYMENT_APPLIED, OBLIGATION_WAIVED)
- Verify: guards (isFullySettled)
- Verify: actions (emitObligationOverdue, createLateFeeObligation, applyPayment, emitObligationSettled, recordWaiver)
- Check: OBLIGATION_WAIVED from `upcoming` state — accepted enhancement not in original SPEC
- Document deviations

### T-007: DoD #1 — Run obligation machine tests
```bash
bun run test convex/engine/machines/__tests__/obligation.machine.test.ts
```
- Verify 24+ test cases pass (SPEC says 24, implementation has 33)
- Extra tests covering partial payment branches and metadata are accepted enhancements

### T-008: DoD #2 — Cross-check collection attempt machine against SPEC §4.1
- Read `convex/engine/machines/collectionAttempt.machine.ts`
- Compare against SPEC §4.1 definition (in context below)
- Verify: 7 states (initiated, pending, failed, retry_scheduled, confirmed, permanent_fail, cancelled)
- Verify: 8 events (DRAW_INITIATED, PROVIDER_ACKNOWLEDGED, FUNDS_SETTLED, DRAW_FAILED, RETRY_ELIGIBLE, MAX_RETRIES_EXCEEDED, RETRY_INITIATED, ATTEMPT_CANCELLED)
- Verify: guards (canRetry)
- Verify: ManualPaymentMethod immediate path (initiated → confirmed via FUNDS_SETTLED)

### T-009: DoD #2 — Run collection attempt machine tests
```bash
bun run test convex/engine/machines/__tests__/collectionAttempt.test.ts
```
- Verify 56+ test cases pass (7 states × 8 events)

### T-010: Document deviations
- Create a summary of all deviations found in T-006 through T-009
- Categorize as: accepted enhancement, spec drift (needs fix), or spec update needed
