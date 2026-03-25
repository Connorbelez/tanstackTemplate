# Chunk 3: Integration Tests & Effects Verification

- [ ] T-007: DoD #4 — Verify happy path end-to-end test exists in integration tests:
  - initiated → DEAL_LOCKED → lawyerOnboarding.pending (effects: reserveShares, notifyAllParties, createDocumentPackage)
  - → LAWYER_VERIFIED → lawyerOnboarding.verified (effects: createDealAccess)
  - → REPRESENTATION_CONFIRMED → documentReview.pending (onDone auto-transition)
  - → LAWYER_APPROVED_DOCUMENTS → documentReview.signed
  - → ALL_PARTIES_SIGNED → fundsTransfer.pending (effects: archiveSignedDocuments)
  - → FUNDS_RECEIVED → confirmed (effects: commitReservation, prorateAccrualBetweenOwners, updatePaymentSchedule, revokeLawyerAccess)

- [ ] T-008: DoD #5 — Verify cancellation tests exist for:
  - Cancel from `initiated` → `failed`
  - Cancel from `lawyerOnboarding.pending` → `failed` with voidReservation + revokeAllDealAccess
  - Cancel from `documentReview.signed` → `failed` with same effects
  - Cancel from `fundsTransfer.pending` → `failed` with same effects

- [ ] T-009: DoD #6 — Read effect code, verify `commitReservation`:
  - Reads `reservationId` from deal record (top-level field, NOT machineContext)
  - If `reservationId` is missing → logs and exits (no throw)
  - Uses idempotency key `deal:${dealId}:commit`
  - Deterministic given valid reservation

- [ ] T-010: DoD #7 — Verify idempotency strategy for all effects:
  - `reserveShares` — idempotency key `deal:${dealId}:reserve`
  - `commitReservation` — idempotency key `deal:${dealId}:commit`
  - `voidReservation` — idempotency key `deal:${dealId}:void`
  - `prorateAccrualBetweenOwners` — checks existing entries by dealId
  - `updatePaymentSchedule` — checks existing reroute by dealId
  - `createDealAccess` — checks existing active access
  - `revokeAllDealAccess` — soft-delete (status → "revoked")
  - `revokeLawyerAccess` — same soft-delete pattern

- [ ] T-011: DoD #8 — Verify prorate math in `convex/engine/effects/dealClosingProrate.ts`:
  - Daily rate: `(interestRate × fractionalShare × principal) / 365`
  - Seller days: `daysBetween(lastPaymentDate, closingDate)`
  - Buyer days: `daysBetween(closingDate, nextPaymentDate)`
  - Zero seller days → no seller entry
  - Zero buyer days → no buyer entry
  - Unskip/rewrite the 3 skipped zero-day prorate boundary tests as integration tests
