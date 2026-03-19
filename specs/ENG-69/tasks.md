# ENG-69: Core Types and Date Math Utilities — Master Task List

## Chunk 01: Types and Math (all tasks)

- [x] **T-001** Create `convex/accrual/types.ts` with `OwnershipPeriod`, `AccrualResult`, and `DateRange` types using `Id<"lenders">` and `Id<"mortgages">`
- [x] **T-002** Create `convex/accrual/interestMath.ts` with date helpers: `daysBetween`, `dayAfter`, `dayBefore`, `maxDate`, `minDate` — all UTC-safe, inclusive day count
- [x] **T-003** Add interest calculation functions to `interestMath.ts`: `calculatePeriodAccrual` and `calculateAccrualForPeriods` with full float precision
- [x] **T-004** Create `convex/accrual/__tests__/interestMath.test.ts` with unit tests covering all acceptance criteria (same-date=1, leap year, rate calculations, period clipping)
- [x] **T-005** Run quality gate: `bun check`, `bun typecheck`, `bunx convex codegen`
