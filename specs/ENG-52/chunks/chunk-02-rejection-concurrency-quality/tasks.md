# Chunk 02: Rejection + Concurrency + Quality Gates

## Tasks

### T-007: Implement rejection tests (out-of-phase events)
`describe("Deal Integration — Rejection (UC-DC-04)")` with tests:

1. `LAWYER_VERIFIED from initiated → rejected, state unchanged`
   - Seed deal in "initiated"
   - Fire LAWYER_VERIFIED (belongs to lawyerOnboarding phase, not initiated)
   - Assert: result.success === false
   - Assert: result.newState === "initiated" (unchanged)
   - Assert: result.reason is defined
   - Assert: result.effectsScheduled is empty or undefined
   - Verify rejection journaled in auditJournal with outcome === "rejected"

2. `FUNDS_RECEIVED from lawyerOnboarding.pending → rejected`
   - Advance deal to lawyerOnboarding.pending (via DEAL_LOCKED)
   - Fire FUNDS_RECEIVED (belongs to fundsTransfer phase)
   - Assert rejection

3. `REPRESENTATION_CONFIRMED from lawyerOnboarding.pending → rejected`
   - This tests sub-state ordering: REPRESENTATION_CONFIRMED is valid from lawyerOnboarding.verified, NOT from lawyerOnboarding.pending
   - Assert rejection

### T-008: Implement terminal state rejection tests
Tests that no events are accepted from confirmed or failed states:

1. `any event from confirmed → rejected`
   - Seed deal, advance through full happy path to confirmed
   - Fire DEAL_LOCKED, DEAL_CANCELLED, LAWYER_VERIFIED
   - All should be rejected with state unchanged at "confirmed"

2. `any event from failed → rejected`
   - Seed deal, cancel it (DEAL_CANCELLED) to reach "failed"
   - Fire DEAL_LOCKED, LAWYER_VERIFIED, FUNDS_RECEIVED
   - All should be rejected with state unchanged at "failed"

### T-009: Implement concurrency simulation test
`describe("Deal Integration — Concurrency (UC-DC-05)")`:

`same event fired twice sequentially: first succeeds, second rejected`
1. Seed deal in "initiated"
2. Advance to lawyerOnboarding.pending (DEAL_LOCKED)
3. Admin A fires LAWYER_VERIFIED → succeeds, newState = "lawyerOnboarding.verified"
4. Admin B fires LAWYER_VERIFIED → rejected (state already advanced past pending)
5. Verify both attempts journaled:
   - Query auditJournal for LAWYER_VERIFIED events on this deal
   - Exactly 2 entries
   - 1 with outcome "transitioned", 1 with outcome "rejected"

### T-010: Run quality gates
1. Run `bun check` — fix any lint/format issues
2. Run `bun typecheck` — fix any type errors
3. Run `bunx convex codegen` — ensure codegen is current

### T-011: Run test suite and fix failures
1. Run `bun run test convex/machines/__tests__/deal.integration.test.ts`
2. Fix any failing tests
3. Verify all tests pass
4. Run full test suite `bun run test` to ensure no regressions
