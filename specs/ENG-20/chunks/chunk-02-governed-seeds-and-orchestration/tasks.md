# Chunk 2: Governed Entity Seeds, Orchestration & Verification

- [ ] T-006: Create `convex/seed/seedMortgage.ts` as an `adminMutation` that idempotently seeds 5 `properties`, 5 `mortgages`, and required `mortgageBorrowers` join rows with realistic Canadian mortgage terms
- [ ] T-007: Create `convex/seed/seedObligation.ts` as an `adminMutation` that idempotently seeds 15-20 obligations across the seeded mortgages in `upcoming`, `due`, `overdue`, and `settled` states with synthetic audit trails that match final status
- [ ] T-008: Create `convex/seed/seedOnboardingRequest.ts` as an `adminMutation` that idempotently seeds 3 onboarding requests in `pending_review`, `approved`, and `rejected` states with correct journal history and review metadata
- [ ] T-009: Create `convex/seed/seedAll.ts` as an admin-gated action that orchestrates seed mutations in dependency order, returns a summary payload, and remains safe to rerun; add an action-level admin guard in `convex/fluent.ts` if needed
- [ ] T-010: Add focused Convex tests covering `seedAll` idempotency, expected entity counts, and governed entity status/journal consistency for the seeded dataset
- [ ] T-011: Run `bun check`, `bun typecheck`, and `bunx convex codegen`; run `coderabbit review --plain`; fix any remaining issues before closing the issue
