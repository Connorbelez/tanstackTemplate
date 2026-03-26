# ENG-182: Lender Payout Scheduling & Frequency Configuration

## Master Task List

### Chunk 1: Schema & Configuration ✅
- [x] T-001: Add `payoutFrequency`, `lastPayoutDate`, `minimumPayoutCents` fields to `lenders` table in `convex/schema.ts`
- [x] T-002: Create `convex/payments/payout/config.ts` — frequency types, `isPayoutDue()` logic, constants (`DEFAULT_PAYOUT_FREQUENCY`, `MINIMUM_PAYOUT_CENTS`)
- [x] T-003: Create `payoutFrequencyValidator` in `convex/payments/payout/validators.ts`

### Chunk 2: Backend Queries & Mutations ✅
- [x] T-004: Create `convex/payments/payout/queries.ts` — `getEligibleDispersalEntries` (internal query: pending entries past hold period for a lender)
- [x] T-005: Create `convex/payments/payout/queries.ts` — `getLendersWithPayableBalance` (internal query: active lenders)
- [x] T-006: Create `convex/payments/payout/mutations.ts` — `markEntriesDisbursed` (internal mutation: update dispersal entry status to `disbursed`)
- [x] T-007: Create `convex/payments/payout/mutations.ts` — `updateLenderPayoutDate` (internal mutation: patch lender's `lastPayoutDate`)
- [x] T-008: Create `convex/payments/payout/adminPayout.ts` — `triggerImmediatePayout` (admin action: immediate payout bypassing frequency, respecting hold)

### Chunk 3: Batch Processing & Cron Registration ✅
- [x] T-009: Create `convex/payments/payout/batchPayout.ts` — `processPayoutBatch` (internal action: daily cron handler)
- [x] T-010: Register daily payout cron at 08:00 UTC in `convex/crons.ts`

### Chunk 4: Tests ✅
- [x] T-011: Create `convex/payments/payout/__tests__/config.test.ts` — unit tests for `isPayoutDue()`
- [x] T-012: Create `convex/payments/payout/__tests__/batchPayout.test.ts` — integration tests for batch payout flow
- [x] T-013: Create `convex/payments/payout/__tests__/adminPayout.test.ts` — integration tests for admin immediate payout
