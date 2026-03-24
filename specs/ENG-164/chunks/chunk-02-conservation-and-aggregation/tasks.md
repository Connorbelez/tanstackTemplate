# Chunk 2: Conservation Checks and Aggregation

- [ ] T-010: Implement `checkObligationConservation` — verify SUM(dispersals) + servicingFee == obligation.amount for all settled obligations
- [ ] T-011: Implement `checkMortgageMonthConservation` — per mortgage/month, verify settled amounts == dispersals + fees
- [ ] T-012: Implement `runFullReconciliationSuite` — run all 8 checks + 2 conservation checks, return aggregated `{ isHealthy, checkResults }`
