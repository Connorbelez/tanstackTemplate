# Chunk 03: Unit Tests — Reversal Cascade

- [ ] T-006: Full reversal cascade test (CASH_RECEIVED + 2×LENDER_PAYABLE_CREATED + SERVICING_FEE → all reversed)
- [ ] T-007: Cascade with clawback (payout already sent → Step 4 fires)
- [ ] T-008: Cascade without clawback (no payout → Step 4 skipped)
- [ ] T-009: Idempotency (calling cascade twice returns same entries)
- [ ] T-010: Amount validation (reversal amount > original → ConvexError)
- [ ] T-011: causedBy linkage (every REVERSAL references its original)
- [ ] T-012: Posting group integrity (all share postingGroupId, CONTROL:ALLOCATION nets to zero)
- [ ] T-013: `postTransferReversal()` single-entry reversal test
