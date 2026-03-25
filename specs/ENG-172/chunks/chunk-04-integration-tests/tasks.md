# Chunk 4: Integration Tests

## Tasks

- [ ] T-016: E2E test: accrue → receive cash → allocate → reverse → verify all account balances
- [ ] T-017: E2E test: accrue → receive → allocate → payout → reverse → verify clawback
- [ ] T-018: Test `findSettledObligationsWithNonZeroBalance()` detects reversed obligations
- [ ] T-019: Test posting group nets to zero via `validatePostingGroupEntries` after reversal
- [ ] T-020: Run quality gate: `bun check`, `bun typecheck`, `bunx convex codegen`
