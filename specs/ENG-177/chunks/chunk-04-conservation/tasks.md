# Chunk 4: Financial Conservation Test Suite

- [ ] T-016: Conservation test: per obligation, settled amount = SUM(dispersals) + servicing fee
- [ ] T-017: Conservation test: CONTROL:ALLOCATION nets to zero per posting group
- [ ] T-018: Conservation test: no negative LENDER_PAYABLE outside active reversals
- [ ] T-019: Conservation test: point-in-time reconstruction matches running balances (replay integrity)
- [ ] T-020: Conservation test: idempotent replay — posting same entries twice produces same state
- [ ] T-021: Run quality gate: `bun check`, `bun typecheck`, `bunx convex codegen`
