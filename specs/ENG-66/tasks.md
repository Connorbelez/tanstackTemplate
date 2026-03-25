# ENG-66: Implementation Tasks

## Status: Complete

### Chunk 1: Collection Plan Queries + Seed Mutation

- [x] T-001: Extract shared obligation generation logic into `convex/payments/obligations/generateImpl.ts`
- [x] T-002: Refactor `convex/payments/obligations/generate.ts` to use shared `generateObligationsImpl`
- [x] T-003: Create `convex/payments/collectionPlan/queries.ts` with `getEntryForObligation`
- [x] T-004: Add `getPlanEntriesByStatus` to `convex/payments/collectionPlan/queries.ts`
- [x] T-005: Create `convex/seed/seedPaymentData.ts` with `seedPaymentData` mutation
- [x] T-006: Wire `seedPaymentData` into `convex/seed/seedAll.ts` orchestrator
- [x] T-007: Run `bunx convex codegen && bun check && bun typecheck` — fix any errors
