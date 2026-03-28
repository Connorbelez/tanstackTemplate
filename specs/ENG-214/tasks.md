# ENG-214: Zero-Regression Test Suite for Unified Payment Rails

## Master Task List

### Chunk 1: Transfer Machine & Provider Registry Unit Tests ✅ (72 tests)
- [x] T-001: Transfer machine — all valid state transitions via XState `transition()`
- [x] T-002: Transfer machine — all invalid transitions rejected (no state change)
- [x] T-003: Transfer machine — actions fire on correct transitions
- [x] T-004: Provider registry — resolution for all provider codes, unknown code error, production guard
- [x] T-005: Provider registry — mock provider environment gating (ENABLE_MOCK_PROVIDERS)

### Chunk 2: Cash Ledger Bridge Mapping & Webhook Tests ✅ (63 new + 20 existing)
- [x] T-006: Cash ledger bridge mapping — all transfer types → correct entry type + debit/credit accounts
- [x] T-007: Idempotency key convention — transfer receipts, payouts, reversals follow `cash-ledger:{type}:transfer:{id}` format
- [x] T-008: Webhook simulation → transfer state transition pipeline (mock provider through GT)
- [x] T-009: Webhook deduplication — same eventId processed twice → zero additional state changes
- [x] T-010: Reconciliation — orphan detection, freshness threshold, healing escalation

### Chunk 3: Inbound Collection Flow Integration Tests ✅ (5 tests)
- [x] T-011: Full inbound flow — collection plan entry → collection attempt → bridge transfer → obligation PAYMENT_APPLIED
- [x] T-012: Manual inbound transfer (non-bridged) → cash ledger CASH_RECEIVED posting with correct accounts
- [x] T-013: Bridge transfer D4 conditional — bridged transfer skips cash posting, non-bridged posts
- [x] T-014: Bridge idempotency — re-running emitPaymentReceived does not create duplicate transfer

### Chunk 4: Outbound & Multi-Leg Integration Tests ✅ (4 tests)
- [x] T-015: Obligation settlement → dispersal calculation → outbound transfer creation
- [x] T-016: Failed outbound transfer leaves LENDER_PAYABLE intact (no money lost)
- [x] T-017: Deal close Leg 1 success + Leg 2 failure → trust-held state (TRUST_CASH holds funds)
- [x] T-018: Manual outbound transfer → cash ledger LENDER_PAYOUT_SENT posting

### Chunk 5: Financial Property Tests & Regression Verification ✅ (14 tests + regression)
- [x] T-019: Property — sum of rounded dispersal outputs = distributable amount (rounding invariant)
- [x] T-020: Property — one transfer confirmation = exactly one ledger posting (no duplicates)
- [x] T-021: Property — replayed webhook = zero additional postings (idempotency invariant)
- [x] T-022: Property — reversal net effect = zero across original + compensating postings
- [x] T-023: Regression — all existing payment/transfer tests pass unchanged, full suite green
