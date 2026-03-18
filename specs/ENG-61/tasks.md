# ENG-61: Rules Engine + ScheduleRule + RetryRule + LateFeeeRule + Seed Rules

## Master Task List

### Chunk 1: Foundation (directories + queries + mutations) ✅
- [x] T-001: Create `convex/payments/collectionPlan/` and `convex/payments/collectionPlan/rules/` directories
- [x] T-002: Add obligation query helpers to `convex/obligations/queries.ts` — `getUpcomingInWindow` + `getLateFeeForObligation`
- [x] T-003: Create `convex/payments/collectionPlan/queries.ts` — `getEnabledRules`, `getEntryForObligation`, `getPlanEntriesByStatus`
- [x] T-004: Create `convex/payments/collectionPlan/mutations.ts` — `createEntry` + `convex/obligations/mutations.ts` — `createObligation`

### Chunk 2: Engine + Rules ✅
- [x] T-005: Create `convex/payments/collectionPlan/engine.ts` — RuleHandler interface, registry, evaluateRules internalAction
- [x] T-006: Create `convex/payments/collectionPlan/rules/scheduleRule.ts` — ScheduleRule handler
- [x] T-007: Create `convex/payments/collectionPlan/rules/retryRule.ts` — RetryRule handler
- [x] T-008: Create `convex/payments/collectionPlan/rules/lateFeeRule.ts` — LateFeeeRule handler
- [x] Bonus: Added `getById` internal query to `convex/obligations/queries.ts`

### Chunk 3: Seed + Tests + Validation ✅
- [x] T-009: Create `convex/payments/collectionPlan/seed.ts` — idempotent seed mutation for 3 default rules
- [x] T-010: Create `convex/payments/__tests__/rules.test.ts` — 13 tests all passing
- [x] T-011: Final validation — `bun check` clean, 13/13 tests pass
