# Chunk 3 Context: Integration Tests & Effects Verification

## Effect Files to Read

### Core Deal Closing Effects
- `convex/engine/effects/dealClosing.ts` — reserveShares, commitReservation, voidReservation
- `convex/engine/effects/dealClosingProrate.ts` — prorateAccrualBetweenOwners
- `convex/engine/effects/dealClosingPayments.ts` — updatePaymentSchedule
- `convex/engine/effects/dealAccess.ts` — createDealAccess, revokeAllDealAccess, revokeLawyerAccess

### Stub Effects (Phase 2 placeholders)
- `convex/engine/effects/dealClosingEffects.ts` — notifyAllParties, notifyCancellation, createDocumentPackage, archiveSignedDocuments, confirmFundsReceipt

### Integration Test File
- `convex/machines/__tests__/deal.integration.test.ts` — full pipeline tests

## SPEC Section 5 — Effect Specifications

### reserveShares (on DEAL_LOCKED)
- Calls ledger `reserveShares()` with idempotency key `deal:${dealId}:reserve`
- Stores `reservationId` on deal record (top-level field, accepted divergence from SPEC's machineContext)
- Sets via `internal.deals.mutations.setReservationId`

### commitReservation (on confirmed — via fundsTransfer.onDone)
- Reads `reservationId` from deal record (top-level field)
- If missing → `console.error` and return (no throw — effect failure is non-fatal)
- Uses idempotency key `deal:${dealId}:commit`
- Deterministic: given valid pending reservation, cannot fail

### voidReservation (on DEAL_CANCELLED)
- Reads `reservationId` from deal record
- If missing → return (deal cancelled before DEAL_LOCKED, no reservation exists)
- Uses idempotency key `deal:${dealId}:void`

### prorateAccrualBetweenOwners (on confirmed)
- Idempotency: checks existing prorate entries by dealId before writing
- Daily rate formula: `(interestRate × fractionalShare × principal) / 365`
  - Note: `fractionalShare` is 1-10000, must be converted to fraction (÷ 10000)
- Seller days: `daysBetween(lastPaymentDate, closingDate)`
- Buyer days: `daysBetween(closingDate, nextPaymentDate)`
- Zero seller days (closing = lastPayment) → no seller entry written
- Zero buyer days (closing = nextPayment) → no buyer entry written

### updatePaymentSchedule (on confirmed)
- Finds future undisbursed obligations for seller's share on this mortgage
- Reroutes transferred share's portion to buyer
- Idempotency: checks if obligation already rerouted by this dealId

### createDealAccess (on LAWYER_VERIFIED)
- Checks if active access already exists before granting
- Grants access with role from `deal.lawyerType`

### revokeAllDealAccess (on DEAL_CANCELLED)
- Soft-delete: sets `status: "revoked"` and `revokedAt: Date.now()`
- Re-run sets same values (idempotent)

### revokeLawyerAccess (on confirmed — 4th effect, accepted divergence from SPEC)
- Same soft-delete pattern but only for lawyer roles

## Skipped Tests (DoD #8 / AC #17)
Three tests in `convex/deals/__tests__/effects.test.ts` are marked `it.skip`:
1. "zero seller days: closing on last payment date — only buyer entry"
2. "zero buyer days: closing on next payment date — only seller entry"
3. "happy path: writes seller and buyer prorate entries"

These are skipped due to convex-test limitations (internal queries from action context). They must be rewritten as integration tests where the full Convex runtime is available. Add them to `convex/machines/__tests__/deal.integration.test.ts` or create a dedicated prorate integration test file.

## Key Integration Test Patterns
The integration tests should use `convex-test` with the full test environment. Follow existing test patterns in the file for setup (creating test mortgages, investors, ownership positions) and assertions.
