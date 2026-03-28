# Chunk 3: Inbound Collection Flow Integration Tests

## Tasks

- [ ] T-011: Full inbound flow — collection plan entry → collection attempt → bridge transfer → obligation PAYMENT_APPLIED
- [ ] T-012: Manual inbound transfer (non-bridged) → cash ledger CASH_RECEIVED posting with correct accounts
- [ ] T-013: Bridge transfer D4 conditional — bridged transfer skips cash posting, non-bridged posts
- [ ] T-014: Bridge idempotency — re-running emitPaymentReceived does not create duplicate transfer
