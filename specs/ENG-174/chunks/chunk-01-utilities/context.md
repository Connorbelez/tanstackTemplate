# Chunk 01 Context: Utilities & Config

## From Implementation Plan (ENG-174)

### Business Day Utility Design
```typescript
/**
 * Calculate a date N business days after a given date.
 * Business days exclude weekends (Saturday, Sunday).
 * Holiday support is deferred — add an optional holiday calendar parameter later.
 */
export function addBusinessDays(startDate: string, days: number): string

/**
 * Check if a given date (YYYY-MM-DD) is a business day.
 */
export function isBusinessDay(date: string): boolean

/**
 * Count business days between two dates (exclusive of end).
 */
export function countBusinessDaysBetween(start: string, end: string): number
```

Logic: Parse YYYY-MM-DD string, use `Date.getUTCDay()` to check for Saturday (6) / Sunday (0). Loop to add days, skipping weekends.

### Hold Period Config Design
```typescript
export interface HoldPeriodConfig {
  /** Number of business days to hold before payout eligibility */
  holdBusinessDays: number;
}

/** Default hold periods by payment method */
export const HOLD_PERIOD_BY_METHOD: Record<string, HoldPeriodConfig> = {
  manual: { holdBusinessDays: 0 },
  mock_pad: { holdBusinessDays: 5 },
  rotessa_pad: { holdBusinessDays: 5 },
  stripe_ach: { holdBusinessDays: 7 },
};

export const DEFAULT_HOLD_PERIOD: HoldPeriodConfig = { holdBusinessDays: 5 };

export function getHoldPeriod(method: string): HoldPeriodConfig
export function calculatePayoutEligibleDate(dispersalDate: string, method: string): string
```

## From Tech Design §5.5
- PAD (Rotessa): 5 business days (90-day reversal window risk)
- ACH (Stripe): 7 business days (60-day return window risk)
- Manual payments: 0 days (immediate, no reversal risk)

## From Tech Design §7.2 — Date Convention
- Business dates are YYYY-MM-DD strings
- System timestamps are Unix ms (number)
- All business dates are UTC midnight semantics

## Constraints
- No holiday calendar in Phase 5. Weekends only.
- Holiday support is deferred — design the function signature to accept an optional holiday calendar parameter later.
- These are pure functions with no Convex dependencies — fully unit testable.

## File Locations
- Business day utility: `convex/lib/businessDays.ts` (new)
- Hold period config: `convex/dispersal/holdPeriod.ts` (new)
- Business day tests: `convex/lib/__tests__/businessDays.test.ts` (new)
- Hold period tests: `convex/dispersal/__tests__/holdPeriod.test.ts` (new)

## Existing Patterns
- Test files use vitest (`import { describe, it, expect } from "vitest"`)
- Tests are in `__tests__/` subdirectories next to the code they test
- Use descriptive `describe` blocks and specific `it` descriptions
