# ENG-41: System Bootstrap Mutation — Tasks

## Status: Complete

## Tasks

- [x] T-001: Extract `initializeSequenceCounterInternal` plain function from `convex/ledger/sequenceCounter.ts`
- [x] T-002: Create `convex/ledger/bootstrap.ts` with `bootstrapLedger` adminMutation
- [x] T-003: Wire `bootstrapLedger` into `convex/seed/seedAll.ts` as first step
- [x] T-004: Create `convex/ledger/__tests__/bootstrap.test.ts` with test cases
- [x] T-005: Run quality checks (`bun check`, `bun typecheck`, `bunx convex codegen`, `bun run test`)
