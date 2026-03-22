# Chunk 04: Financial Invariant Tests

## Tasks
- [ ] T-016: CONTROL:ALLOCATION net-zero per posting group — complete group nets to zero, incomplete has non-zero, multiple groups independent
- [ ] T-017: Non-negative LENDER_PAYABLE — rejects payout exceeding balance, allows REVERSAL to make negative (clawback)
- [ ] T-018: Point-in-time reconstruction — matches running balance at latest timestamp, same-timestamp entries order by sequenceNumber, two replays identical
- [ ] T-019: Idempotent replay — posting same entries twice produces identical state, balances unchanged, no new entries
- [ ] T-020: Append-only correction — CORRECTION creates new entry with causedBy, original unchanged, REVERSAL creates new entry leaving original intact
- [ ] T-021: Reversal traceability — every REVERSAL has causedBy, causedBy references valid entry
