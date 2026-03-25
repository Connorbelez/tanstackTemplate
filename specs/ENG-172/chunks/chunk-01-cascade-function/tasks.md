# Chunk 1: Core Cascade Function

## Tasks

- [ ] T-001: Add `assertReversalAmountValid()` helper to `integrations.ts`
  - Pure function, takes `reversalAmount: number`, `originalAmount: bigint`, `context: string`
  - Uses `safeBigintToNumber()` for conversion
  - Throws `ConvexError({ code: "REVERSAL_EXCEEDS_ORIGINAL", ... })` if reversal > original

- [ ] T-002: Add `postPaymentReversalCascade()` to `integrations.ts`
  - Multi-leg reversal orchestrator per the posting sequence in context.md
  - Takes `attemptId | transferRequestId`, `obligationId`, `mortgageId`, `effectiveDate`, `source`, `reason`
  - Returns `{ reversalEntries, postingGroupId, clawbackRequired }`
  - Full idempotency via postingGroupId check
  - Must handle: CASH_RECEIVED reversal, N×LENDER_PAYABLE_CREATED reversals, SERVICING_FEE reversal, conditional LENDER_PAYOUT_SENT clawback
  - All entries through `postCashEntryInternal()`

- [ ] T-003: Add `postTransferReversal()` to `integrations.ts`
  - Simpler single-entry reversal for transfer-based flows
  - Takes `transferRequestId`, `originalEntryId`, `amount`, `effectiveDate`, `source`, `reason`
  - Loads original, swaps debit/credit, posts REVERSAL via `postCashEntryInternal()`
  - Validates amount ≤ original via `assertReversalAmountValid()`

- [ ] T-004: Verify REVERSAL family constraints in `types.ts`
  - Confirm REVERSAL has `ALL_FAMILIES` for both debit and credit (should already be correct)
  - Add brief documentation comment noting REVERSAL entries skip balance checks (reference postEntry.ts Step 5)
  - No functional changes expected — verification only
