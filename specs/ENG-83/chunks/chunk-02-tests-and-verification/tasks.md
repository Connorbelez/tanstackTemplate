# Chunk 02: Tests & Verification

- [ ] T-007: Add convex tests for lender-scoped reconciliation queries in `convex/dispersal/__tests__/reconciliation.test.ts`, covering pending-balance sums, empty states, date-range filtering, and lender-vs-other-lender authorization.
- [ ] T-008: Extend `convex/dispersal/__tests__/reconciliation.test.ts` with mortgage-, obligation-, and servicing-fee query coverage, including admin access, per-lender aggregation, and empty-range behavior for admin-only reconciliation views.
- [ ] T-009: Run `bun check`, `bunx convex codegen`, `bun typecheck`, and the relevant dispersal/auth test suites; resolve any fallout needed to leave ENG-83 shippable.
