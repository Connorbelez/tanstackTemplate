# ENG-64 — Cross-Entity Chain + E2E Lifecycle Tests

## Master Task List

### Chunk 1: Fix Drift Blockers (Pre-req effects + infrastructure)
- [x] T-001: Create `convex/engine/effects/collectionAttempt.ts` with `emitPaymentReceived` effect
- [x] T-002: Add `emitCollectionFailed` effect to collectionAttempt.ts
- [x] T-003: Add `recordProviderRef` effect to collectionAttempt.ts
- [x] T-004: Add `notifyAdmin` stub effect to collectionAttempt.ts
- [x] T-005: Register all 4 new effects in `convex/engine/effects/registry.ts`
- [x] T-006: Fix `emitObligationOverdue` — replace `stubs.evaluateRules` with `engine.evaluateRules`
- [x] T-007: Expand test factory module globs in `src/test/auth/helpers.ts` to include `payments/**` and `obligations/**`
- [x] T-008: Run `bunx convex codegen && bun typecheck && bun check` — verify all pass

### Chunk 2: Test Helpers + Cross-Entity Chain Tests
- [x] T-009: Create `src/test/convex/payments/helpers.ts` with seedCollectionRules, seedPlanEntry, seedCollectionAttempt, fireTransition, effectArgs helpers
- [x] T-010: Create `src/test/convex/payments/crossEntity.test.ts` — AC1: full payment chain (attempt confirmed → obligation settled → mortgage cure)
- [x] T-011: Add AC2: failure chain (attempt permanent_fail → COLLECTION_FAILED → RetryRule creates new plan entry)
- [x] T-012: Add AC3: overdue chain (obligation overdue → mortgage delinquent + LateFeeRule creates late_fee obligation)
- [x] T-013: Run cross-entity tests, fix any failures, run quality gate

### Chunk 3: End-to-End Lifecycle Tests
- [x] T-014: Create `src/test/convex/payments/endToEnd.test.ts` — AC4: ManualPaymentMethod full lifecycle
- [x] T-015: Add AC5: MockPADMethod async path (initiated → pending → confirmed)
- [x] T-016: Add AC6: partial payment accumulation (partially_settled → second payment → settled)
- [x] T-017: Add AC7: retry chain to eventual success (fail → RetryRule → new attempt → success → settle)
- [x] T-018: Run all tests, fix any failures, run full quality gate (`bunx convex codegen && bun typecheck && bun check && bun run test`)
