# Chunk 3: E2E Scenarios 4–8

- [ ] T-011: Implement Scenario 4 — Reversal: full lifecycle → `postPaymentReversalCascade()` → verify balances revert. Mark as `it.skip` with `// Depends on ENG-172: postPaymentReversalCascade not yet implemented`
- [ ] T-012: Implement Scenario 5 — Reversal after payout (clawback): same as 4 but payout sent first. Mark as `it.skip` with same comment.
- [ ] T-013: Implement Scenario 6 — Admin correction: post entry with wrong amount → `postCashCorrectionForEntry()` → verify reversal + replacement → conservation holds
- [ ] T-014: Implement Scenario 7 — Partial waiver: accrue 100,000 → waive 30,000 → verify BORROWER_RECEIVABLE reduced → remaining 70,000 collectible
- [ ] T-015: Implement Scenario 8 — Full write-off: accrue 100,000 → write off full amount → verify WRITE_OFF = 100,000 → BORROWER_RECEIVABLE net = 0
