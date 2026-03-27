# Chunk 1 Context: Bridge Mapping

## Scope
Finish the actual implementation gap called out by the ENG-197 implementation plan: the bridge already exists, but it still hardcodes the transfer type instead of deriving it from the bridged obligation.

## Verbatim Context from the ENG-197 Implementation Plan
> **Critical Finding: Bridge Already Implemented**  
> The Phase M2a bridge is already implemented in `convex/engine/effects/collectionAttempt.ts` at lines 142-202.

> **Contradictions Found**  
> - **Hardcoded Transfer Type:** The bridge hardcodes `transferType: "borrower_interest_collection"` with a FIXME comment.  
>   - **Impact:** All bridge transfers are labeled as interest collections regardless of actual obligation type (late fees, principal, arrears cures)  
>   - **Recommendation:** Implement the reverse mapping `OBLIGATION_TYPE_TO_TRANSFER_TYPE` and derive `transferType` from `obligation.type`. The forward mapping already exists in `types.ts`.

> **Step 1: Add obligation-to-transfer-type reverse mapping**  
> - **File(s):** `convex/payments/transfers/types.ts`  
> - **Action:** Add `OBLIGATION_TYPE_TO_TRANSFER_TYPE` const record and helper that falls back safely when obligation type is missing.

> **Step 2: Fix hardcoded transferType in bridge**  
> - **File(s):** `convex/engine/effects/collectionAttempt.ts`  
> - **Action:** Replace the hardcoded `borrower_interest_collection` with dynamic lookup using the first obligation’s `type`.

## Verbatim Context from Unified Payment Rails Goal
> ## Transfer Type -> Obligation Type Mapping  
> `borrower_interest_collection` -> `regular_interest`  
> `borrower_principal_collection` -> `principal_repayment`  
> `borrower_late_fee_collection` -> `late_fee`  
> `borrower_arrears_cure` -> `arrears_cure`

> **Migration Strategy — Parallel-First**  
> `applyPayment` continues calling `postCashReceiptForObligation()` unchanged.  
> Additionally creates a `transferRequest` with `status: "confirmed"` / parallel audit-trail intent.  
> Legacy collection-attempt cash posting remains authoritative during M2a.

## Verbatim Context from PaymentRailsSpec
> For low-risk migration, keep `collectionAttempts` as the orchestration entity for borrower collections in phase 1, but have the success path create or reference a `transferRequest`.

> Only inbound transfer confirmation should trigger `PAYMENT_APPLIED`.

## Current Repo Reality to Preserve
- `convex/engine/effects/collectionAttempt.ts` already:
  - posts cash via the collection attempt path first
  - creates a bridge transfer only when no existing `transferRequests` row matches `transfer:bridge:{attemptId}`
  - sets `collectionAttemptId` so `publishTransferConfirmed` skips duplicate cash posting
  - uses GT `executeTransition(... FUNDS_SETTLED ...)` immediately after insert
- `convex/payments/transfers/types.ts` already exports `TRANSFER_TYPE_TO_OBLIGATION_TYPE`; the missing piece is the reverse lookup for inbound bridge creation.

## Integration Constraints
- Do not change the Phase M2a D4 behavior in `convex/engine/effects/transfer.ts`: bridged transfers with `collectionAttemptId` must continue to skip cash posting.
- Do not change the bridge idempotency key format: `transfer:bridge:{collectionAttemptId}`.
- Keep the existing provider-code fallback behavior in the bridge (`manual` when `planEntry.method` is not a canonical provider code).
- Safe default for unmapped or missing obligation types should remain `borrower_interest_collection`.
