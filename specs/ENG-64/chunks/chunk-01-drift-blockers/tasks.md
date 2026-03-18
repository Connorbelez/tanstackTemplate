# Chunk 1: Fix Drift Blockers

- [ ] T-001: Create `convex/engine/effects/collectionAttempt.ts` with `emitPaymentReceived` effect
- [ ] T-002: Add `emitCollectionFailed` effect to collectionAttempt.ts
- [ ] T-003: Add `recordProviderRef` effect to collectionAttempt.ts
- [ ] T-004: Add `notifyAdmin` stub effect to collectionAttempt.ts
- [ ] T-005: Register all 4 new effects in `convex/engine/effects/registry.ts`
- [ ] T-006: Fix `emitObligationOverdue` — replace `stubs.evaluateRules` with `engine.evaluateRules`
- [ ] T-007: Expand test factory module globs in `src/test/auth/helpers.ts` to include `payments/**` and `obligations/**`
- [ ] T-008: Run `bunx convex codegen && bun typecheck && bun check` — verify all pass
