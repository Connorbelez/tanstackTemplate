# ENG-50: Confirmation Effects — Master Task List

## Chunk 1: Schema + Supporting CRUD
- [x] T-001: Add `prorateEntries` table to schema.ts
- [x] T-002: Add `dealReroutes` table to schema.ts
- [x] T-003: Create `convex/mortgages/queries.ts` with `getInternalMortgage` internal query
- [x] T-004: Create `convex/prorateEntries/queries.ts` with `getByDealId` internal query
- [x] T-005: Create `convex/prorateEntries/mutations.ts` with `insertProrateEntries` internal mutation (atomic batch insert)
- [x] T-006: Create `convex/dealReroutes/queries.ts` with `getByDealId` internal query
- [x] T-007: Create `convex/dealReroutes/mutations.ts` with `insert` internal mutation
- [x] T-003b: Create `convex/obligations/queries.ts` with `getSettledBeforeDate` and `getFirstAfterDate`

## Chunk 2: Effects Implementation
- [x] T-008: Implement `commitReservation` effect in `convex/engine/effects/dealClosing.ts`
- [x] T-009: Create `convex/engine/effects/dealClosingProrate.ts` with `prorateAccrualBetweenOwners` effect
- [x] T-010: Create `convex/engine/effects/dealClosingPayments.ts` with `updatePaymentSchedule` effect
- [x] T-011: Update `convex/engine/effects/registry.ts` — replace 3 placeholders with real handlers

## Chunk 3: Tests + Verification
- [x] T-012: Create `convex/deals/__tests__/effects.test.ts` with tests for all 3 effects
- [x] T-013: Run `bun check` (pass), `bun typecheck` (codegen-dependent errors only), `bun run test` (9/9 pass)

## Notes
- `bunx convex codegen` requires a deployment connection (CONVEX_DEPLOYMENT env var). Type errors for new modules (`internal.prorateEntries`, `internal.dealReroutes`, etc.) will resolve once codegen runs.
- All runtime tests pass. The ActionCtx type mismatch in tests is a pre-existing convex-test limitation.
