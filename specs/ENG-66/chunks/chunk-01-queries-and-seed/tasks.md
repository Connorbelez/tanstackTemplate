# Chunk 01: Collection Plan Queries + Seed Mutation

## Tasks

- [ ] T-001: Extract shared obligation generation logic into `convex/payments/obligations/generateImpl.ts`
- [ ] T-002: Refactor `convex/payments/obligations/generate.ts` to use shared `generateObligationsImpl`
- [ ] T-003: Create `convex/payments/collectionPlan/queries.ts` with `getEntryForObligation`
- [ ] T-004: Add `getPlanEntriesByStatus` to `convex/payments/collectionPlan/queries.ts`
- [ ] T-005: Create `convex/seed/seedPaymentData.ts` with `seedPaymentData` mutation
- [ ] T-006: Wire `seedPaymentData` into `convex/seed/seedAll.ts` orchestrator
- [ ] T-007: Run `bunx convex codegen && bun check && bun typecheck` — fix any errors
