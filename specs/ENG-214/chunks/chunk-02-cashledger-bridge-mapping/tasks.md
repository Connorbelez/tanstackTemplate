# Chunk 2: Cash Ledger Bridge Mapping & Webhook Tests

## Tasks

- [ ] T-006: Cash ledger bridge mapping — all transfer types → correct entry type + debit/credit accounts
- [ ] T-007: Idempotency key convention — transfer receipts, payouts, reversals follow format
- [ ] T-008: Webhook simulation → transfer state transition pipeline (mock provider through GT)
- [ ] T-009: Webhook deduplication — same eventId processed twice → zero additional state changes
- [ ] T-010: Reconciliation — orphan detection, freshness threshold, healing escalation
