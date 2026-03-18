# Chunk 01 Context: Types and Math

## Goal
Create the foundational type definitions and pure math utilities for the Accrual Engine. These types and functions are imported by every other accrual and dispersal file. This is the first code written for WS6.

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `convex/accrual/types.ts` | Create | OwnershipPeriod, AccrualResult, DateRange types |
| `convex/accrual/interestMath.ts` | Create | Day-count convention, rate calculations, helpers |
| `convex/accrual/__tests__/interestMath.test.ts` | Create | Unit tests for all math functions |

## Type Definitions

```typescript
// convex/accrual/types.ts
import type { Id } from "../_generated/dataModel";

export type OwnershipPeriod = {
  lenderId: Id<"lenders">;        // SPEC says investorId — adapted to codebase
  mortgageId: Id<"mortgages">;
  fraction: number;                // 0-1 (units / 10000)
  fromDate: string;                // YYYY-MM-DD, inclusive
  toDate: string | null;           // YYYY-MM-DD, inclusive. null = still active
};

export type AccrualResult = {
  mortgageId: Id<"mortgages">;
  lenderId: Id<"lenders">;         // SPEC says investorId
  fromDate: string;
  toDate: string;
  accruedInterest: number;
  periods: Array<{
    fraction: number;
    fromDate: string;
    toDate: string | null;
  }>;
};

export type DateRange = {
  fromDate: string;                // YYYY-MM-DD
  toDate: string;                  // YYYY-MM-DD
};
```

## Function Signatures

```typescript
// convex/accrual/interestMath.ts

// Date helpers
export function daysBetween(fromDate: string, toDate: string): number;
export function dayAfter(date: string): string;
export function dayBefore(date: string): string;
export function maxDate(a: string, b: string): string;
export function minDate(a: string, b: string): string;

// Interest calculations
export function calculatePeriodAccrual(
  annualRate: number,
  fraction: number,
  principalBalance: number,
  days: number,
): number;

export function calculateAccrualForPeriods(
  periods: OwnershipPeriod[],
  annualRate: number,
  principalBalance: number,
  fromDate: string,
  toDate: string,
): number;
```

## Key Design Decisions

1. **Pure functions only** — `convex/accrual/` contains zero Convex persistence, only computation
2. **Actual/365 day-count convention** — actual calendar days (inclusive of start AND end), denominator always 365 even in leap years
3. **Full floating-point precision** — no rounding until final presentation layer
4. **Adapted field names** — use `lenderId` instead of SPEC's `investorId`
5. **No Convex imports in interestMath.ts** — pure functions only, makes unit testing trivial
6. **UTC parsing** — Always append `"T00:00:00Z"` when creating Date objects to avoid timezone drift

## Day Count Formula
- `daysBetween(from, to)` = `Math.floor((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000) + 1`
- Inclusive of both endpoints: `daysBetween("2026-01-15", "2026-01-15")` === 1

## Interest Calculation Formula
- `calculatePeriodAccrual(annualRate, fraction, principalBalance, days)` = `annualRate * fraction * principalBalance * days / 365`
- `calculateAccrualForPeriods`: clips each period to query range via `maxDate(period.fromDate, queryFromDate)` / `minDate(period.toDate ?? queryToDate, queryToDate)`, skips if effectiveFrom > effectiveTo, sums `calculatePeriodAccrual` for each

## Acceptance Criteria
- `daysBetween("2026-01-15", "2026-01-15")` === 1
- `daysBetween("2026-01-01", "2026-01-30")` === 30
- `daysBetween("2028-02-28", "2028-03-01")` === 3 (leap year)
- 10% rate, 100% ownership, $100K, 365 days = $10,000.00
- 10% rate, 50% ownership, $100K, 365 days = $5,000.00

## Drift Report — Field Name Mapping

| SPEC Name | Actual Codebase Name | Used In |
|-----------|---------------------|---------|
| `investorId` | `lenderId` | OwnershipPeriod, AccrualResult |
| `annualRate` | `interestRate` | mortgages table (schema line 427) |
| `principalBalance` | `principal` | mortgages table (schema line 426) |

**Note:** The function parameter names (`annualRate`, `principalBalance`) are fine as-is — they describe the mathematical concept. The drift mapping matters when reading FROM the database in downstream issues (ENG-70, ENG-71).

## Downstream Dependencies (what this provides)
- **ENG-70** (Ownership period derivation): imports `OwnershipPeriod` type, `dayAfter()`, `dayBefore()`
- **ENG-71** (calculateAccruedInterest query): imports `calculateAccrualForPeriods()`, `AccrualResult`, `calculatePeriodAccrual()`
- **ENG-75** (Tests: interest math): imports all functions as test targets
- **ENG-81** (Pro-rata share calculation): location for `calculateProRataShares()` (future)

## Testing Patterns
- Tests live in `__tests__/` subdirectories (e.g., `convex/accrual/__tests__/interestMath.test.ts`)
- Use `import { describe, it, expect } from "vitest"`
- These are pure function tests — no convex-test harness needed, just direct imports
- Test edge cases: same-date, month boundaries, leap year, period clipping, zero-fraction periods
