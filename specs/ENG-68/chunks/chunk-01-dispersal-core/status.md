# Chunk 01: dispersal-core — Status

Completed: 2026-03-19

## Tasks Completed
- [x] T-001: Verified repo reality for money units, ownership units, and schema naming before writing dispersal logic.
- [x] T-002: Added `PositionShare` and `calculateProRataShares(...)` to the accrual math layer.
- [x] T-003: Converted servicing fee math and servicing fee tests to integer-cent arithmetic.
- [x] T-004: Created `convex/dispersal/createDispersalEntries.ts` with idempotency, mortgage and position loading, `dealReroutes` handling, servicing fee deduction, share calculation, and entry insertion.
- [x] T-005: Rewired `emitObligationSettled` to schedule the real dispersal mutation with `settledAmount`, `settledDate`, and an idempotency key.

## Tasks Incomplete
- [ ] None in chunk scope.

## Quality Gate
- `bun check`: pass
- `bun typecheck`: fail — repo has pre-existing unrelated type errors in `convex/deals/__tests__/access.test.ts`, `convex/deals/__tests__/dealClosing.test.ts`, `convex/deals/__tests__/effects.test.ts`, `convex/ledger/__tests__/ledger.test.ts`, `src/components/admin/deal-card.tsx`, `src/routes/demo/convex-ledger.tsx`, and `src/routes/demo/prod-ledger.tsx`
- `bunx convex codegen`: fail — missing `CONVEX_DEPLOYMENT` / local Convex project configuration in this environment
- `bun test convex/dispersal/__tests__/servicingFee.test.ts`: pass

## Notes
- The repo already had the dispersal schema, validators, and servicing fee helper, but the helper was still using dollar-float semantics instead of cents.
- The current obligation effect had been scheduling the stub under `convex/payments/dispersal/stubs.ts`; chunk 1 switches that scheduling path to the real internal mutation.
- `convex/_generated/api.d.ts` was updated locally to include `dispersal/createDispersalEntries`; full Convex codegen is still blocked by environment setup.
