# Chunk 2: Conservation Checks and Aggregation

- [x] T-010: Implement `checkObligationConservation` — verify SUM(dispersals) + servicingFee == obligation.amount for all settled obligations
- [x] T-011: Implement `checkMortgageMonthConservation` — per mortgage/month, verify settled amounts == dispersals + fees
- [x] T-012: Implement `runFullReconciliationSuite` — run all 8 checks + 2 conservation checks, return aggregated `{ isHealthy, checkResults }`
