# ENG-60: Obligation Cross-Entity Effects — Task List

## Chunk 1: Effect Implementations
- [ ] T-001: Create `convex/engine/effects/obligationPayment.ts` — `applyPayment` effect
- [ ] T-002: Create `convex/engine/effects/obligationLateFee.ts` — `createLateFeeObligation` effect
- [ ] T-003: Create `convex/engine/effects/obligationWaiver.ts` — `recordWaiver` effect
- [ ] T-004: Create `convex/payments/collectionPlan/stubs.ts` — rules engine stub
- [ ] T-005: Create `convex/payments/dispersal/stubs.ts` — dispersal stub
- [ ] T-006: Enhance `emitObligationOverdue` in `convex/engine/effects/obligation.ts` — add rules engine trigger
- [ ] T-007: Enhance `emitObligationSettled` in `convex/engine/effects/obligation.ts` — add dispersal scheduling
- [ ] T-008: Update `convex/engine/effects/registry.ts` — point to new implementations
- [ ] T-009: Delete `convex/engine/effects/obligationPlaceholders.ts`
- [ ] T-010: Run `bunx convex codegen && bun check && bun typecheck` — quality gate

## Chunk 2: Tests + Validation
- [ ] T-011: Create `convex/engine/effects/__tests__/obligation.effects.test.ts` — unit tests
- [ ] T-012: Run full test suite — `bun run test`
- [ ] T-013: Final quality gate — `bun check && bun typecheck && bunx convex codegen`
