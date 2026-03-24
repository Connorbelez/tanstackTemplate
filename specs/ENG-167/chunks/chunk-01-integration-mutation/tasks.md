# Chunk 1: Integration Function + Admin Mutation + Tests

## Tasks

- [ ] T-001: Add `postObligationWriteOff` integration function to `convex/payments/cashLedger/integrations.ts`
- [ ] T-002: Add `writeOffObligationBalance` admin mutation to `convex/payments/cashLedger/mutations.ts`
- [ ] T-003: Add `findActiveCollectionAttempts` helper (used by mutation for warning)
- [ ] T-004: Create `convex/payments/cashLedger/__tests__/writeOff.test.ts` with all test cases
- [ ] T-005: Run quality gate (`bun check`, `bun typecheck`, `bunx convex codegen`)
