# Chunk 2: Test Helpers + Cross-Entity Chain Tests

- [ ] T-009: Create `src/test/convex/payments/helpers.ts` with seedCollectionRules, seedPlanEntry, seedCollectionAttempt, fireTransition, effectArgs helpers
- [ ] T-010: Create `src/test/convex/payments/crossEntity.test.ts` — AC1: full payment chain (attempt confirmed → obligation settled → mortgage cure)
- [ ] T-011: Add AC2: failure chain (attempt permanent_fail → COLLECTION_FAILED → RetryRule creates new plan entry)
- [ ] T-012: Add AC3: overdue chain (obligation overdue → mortgage delinquent + LateFeeRule creates late_fee obligation)
- [ ] T-013: Run cross-entity tests, fix any failures, run quality gate
