# ENG-159: Journal Cash Receipts from Collection Confirmations — Master Tasks

## Scope Note
~70% of the work already exists (per drift report). The core CASH_RECEIVED posting pipeline is wired:
`FUNDS_SETTLED → confirmed → emitPaymentReceived → PAYMENT_APPLIED → applyPayment → postCashReceiptForObligation`

Remaining work: overpayment routing, SUSPENSE handling, postingGroupId, and tests.

---

## Chunk 1: Implementation Changes

- [x] T-001: Update CASH_ENTRY_TYPE_FAMILY_MAP — add UNAPPLIED_CASH to CASH_RECEIVED credit families
- [x] T-002: Add `postingGroupId` parameter to `postCashReceiptForObligation`
- [x] T-003: Add `postOverpaymentToUnappliedCash` integration function
- [x] T-004: Update `postCashReceiptForObligation` to handle missing receivable gracefully (warn + skip with TODO for ENG-156)
- [x] T-005: Pass `postingGroupId` through `applyPayment` effect to `postCashReceiptForObligation`
- [x] T-006: Generate `postingGroupId` in `emitPaymentReceived` and pass through PAYMENT_APPLIED transitions
- [x] T-007: Add overpayment routing after obligation loop in `emitPaymentReceived`

## Chunk 2: Tests

- [x] T-008: Unit tests for cash receipt edge cases (happy path, partial, overpayment, multi-obligation, idempotency, already-settled, missing receivable)
- [x] T-009: Integration tests for full confirmation flow (FUNDS_SETTLED → CASH_RECEIVED entries, multi-obligation, overpayment end-to-end)
