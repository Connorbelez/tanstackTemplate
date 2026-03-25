# Chunk 3: Unit Tests

## Tasks

- [ ] T-008: Test full reversal cascade — CASH_RECEIVED + 2×LENDER_PAYABLE_CREATED + SERVICING_FEE → all reversed with correct accounts
- [ ] T-009: Test cascade with clawback — payout already sent → Step 4 fires
- [ ] T-010: Test cascade without clawback — no payout sent → Step 4 skipped
- [ ] T-011: Test idempotency — calling cascade twice returns same entries
- [ ] T-012: Test amount validation — reversal amount > original → ConvexError
- [ ] T-013: Test causedBy linkage — every REVERSAL entry references its original
- [ ] T-014: Test posting group integrity — all entries share `postingGroupId`
- [ ] T-015: Test `postTransferReversal()` — single-entry reversal with correct idempotency
