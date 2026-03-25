# ENG-169: Admin Cash Application and Suspense Resolution — Task List

## Chunk 1: Integration Functions (integrations.ts)

- [x] T-001: Add `postCashApplication()` integration function to `integrations.ts`
- [x] T-002: Add `postSuspenseResolution()` integration function to `integrations.ts`

## Chunk 2: Admin Mutations (mutations.ts)

- [x] T-003: Add `applyCashToObligation` admin mutation to `mutations.ts`
- [x] T-004: Add `resolveSuspenseItem` admin mutation to `mutations.ts`

## Chunk 3: Tests

- [x] T-005: Create `cashApplication.test.ts` — 10 tests, all passing
- [x] T-006: Create `suspenseResolution.test.ts` — 10 tests, all passing
- [x] T-007: Run quality gate (`bun check` ✓, `bun typecheck` ✓, `bunx convex codegen` ✓)
