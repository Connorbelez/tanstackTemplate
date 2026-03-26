# Tasks: ENG-180 — Corrective Obligation Creation After Payment Reversal

Source: Linear ENG-180, Notion implementation plan
Generated: 2026-03-26

## Phase 1: Core Mutation — createCorrectiveObligation

- [x] T-001: Create `convex/payments/obligations/createCorrectiveObligation.ts` with `createCorrectiveObligation` internalMutation. Args: `originalObligationId: v.id("obligations")`, `reversedAmount: v.number()`, `reason: v.string()`, `postingGroupId: v.string()`, `source` (CommandSource shape). Validates original is in `settled` status, validates reversedAmount is positive safe integer, checks idempotency via `by_type_and_source` index (matching type + sourceObligationId, filtering out `late_fee`). Creates new obligation with: `status: "upcoming"`, same `type`/`mortgageId`/`borrowerId`/`paymentNumber` as original, `amount: reversedAmount`, `amountSettled: 0`, `dueDate: Date.now()`, `gracePeriodEnd: Date.now() + 15 days`, `sourceObligationId: originalObligationId`. Returns `{ obligationId, created: boolean }`.
- [x] T-002: After inserting the corrective obligation in T-001, call `postObligationAccrued(ctx, { obligationId: correctiveId, source })` to establish the cash ledger BORROWER_RECEIVABLE + CONTROL:ACCRUAL entries for the new obligation. Import from `../../payments/cashLedger/integrations`.
- [x] T-003: Add `by_source_obligation` index to obligations table in `convex/schema.ts`: `.index("by_source_obligation", ["sourceObligationId"])`. This enables querying all corrective obligations by source regardless of type.

## Phase 2: Wiring & Query

- [x] T-010: Wire corrective obligation creation into `emitPaymentReversed` in `convex/engine/effects/collectionAttempt.ts`. After the `postPaymentReversalCascade` call completes for each obligation, call `createCorrectiveObligation` via `ctx.scheduler.runAfter(0, ...)` passing: `originalObligationId`, `reversedAmount` (the `cashReceivedAmount` from the cascade result — use `safeBigintToNumber` on the first REVERSAL entry's amount that matches CASH_RECEIVED causedBy), `reason`, `postingGroupId` from cascade result, and `source`. Only create corrective if obligation status is `settled`.
- [x] T-011: Add `getCorrectiveObligations` internalQuery to `convex/payments/obligations/queries.ts`. Args: `sourceObligationId: v.id("obligations")`. Uses the new `by_source_obligation` index to find all obligations where `sourceObligationId` matches, filtering out `late_fee` type. Returns the full obligation documents.
- [x] T-012: Add `getObligationWithCorrectives` internalQuery to `convex/payments/obligations/queries.ts`. Args: `obligationId: v.id("obligations")`. Returns the obligation plus its corrective obligations (via `by_source_obligation` index), providing a complete view of original + correctives.

## Phase 3: Tests

- [x] T-020: Create `convex/payments/obligations/__tests__/correctiveObligation.test.ts`. Test happy path: create a settled obligation (seed directly), call `createCorrectiveObligation`, verify new obligation has correct fields (`status: "upcoming"`, `sourceObligationId`, `amount`, same `type`/`mortgageId`/`borrowerId`/`paymentNumber`).
- [x] T-021: Test idempotency: calling `createCorrectiveObligation` twice with same `originalObligationId` returns existing without creating duplicate. Verify `created: false` on second call.
- [x] T-022: Test validation: calling with non-settled obligation throws `INVALID_CORRECTIVE_SOURCE`. Calling with zero/negative amount throws `INVALID_CORRECTIVE_AMOUNT`.
- [x] T-023: Test cash ledger integration: after `createCorrectiveObligation`, verify `OBLIGATION_ACCRUED` journal entry exists for the corrective obligation with correct amount in BORROWER_RECEIVABLE.
- [x] T-024: Test queryable link: `getCorrectiveObligations(originalId)` returns the corrective. Verify it doesn't return late_fee obligations for the same source.
- [x] T-025: Test original unchanged: after corrective creation, original obligation remains in `settled` status with unchanged `amount` and `amountSettled`.
