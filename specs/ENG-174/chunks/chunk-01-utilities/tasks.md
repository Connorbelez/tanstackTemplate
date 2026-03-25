# Chunk 01: Utilities & Config

## Tasks

### T-001: Create business day utility
**File:** `convex/lib/businessDays.ts` (new)

Create three pure functions:

1. `addBusinessDays(startDate: string, days: number): string`
   - Parse YYYY-MM-DD string, use `Date.getUTCDay()` to check Saturday (6) / Sunday (0)
   - Loop forward, skipping weekends
   - If `days === 0`, return startDate as-is (manual payments)
   - If startDate falls on a weekend, advance to next Monday before counting

2. `isBusinessDay(date: string): boolean`
   - Returns false for Saturday/Sunday, true otherwise

3. `countBusinessDaysBetween(start: string, end: string): number`
   - Count business days between two dates (exclusive of end)
   - If start >= end, return 0

All dates are YYYY-MM-DD strings per project convention (Tech Design §7.2). Use UTC throughout.

### T-002: Create hold period configuration
**File:** `convex/dispersal/holdPeriod.ts` (new)

1. Define `HoldPeriodConfig` interface with `holdBusinessDays: number`

2. Define `HOLD_PERIOD_BY_METHOD` constant:
   - `manual`: 0 days
   - `mock_pad`: 5 days (test mirrors PAD)
   - `rotessa_pad`: 5 days
   - `stripe_ach`: 7 days

3. Define `DEFAULT_HOLD_PERIOD`: 5 business days

4. `getHoldPeriod(method: string): HoldPeriodConfig`
   - Lookup in HOLD_PERIOD_BY_METHOD, fallback to DEFAULT_HOLD_PERIOD

5. `calculatePayoutEligibleDate(dispersalDate: string, method: string): string`
   - Uses `getHoldPeriod` + `addBusinessDays` from T-001
   - Returns YYYY-MM-DD

### T-003: Unit tests for business day utility
**File:** `convex/lib/__tests__/businessDays.test.ts` (new)

Test cases:
1. Monday + 1 business day = Tuesday
2. Friday + 1 business day = next Monday
3. Friday + 5 business days = next Friday
4. Saturday + 1 business day = Tuesday (next Monday + 1)
5. Sunday + 1 business day = Tuesday
6. 0 business days = same date (for manual payments)
7. `isBusinessDay` returns false for weekends, true for weekdays
8. `countBusinessDaysBetween` various date ranges
9. Edge case: December crossing into January

### T-004: Unit tests for hold period config
**File:** `convex/dispersal/__tests__/holdPeriod.test.ts` (new)

Test cases:
1. `getHoldPeriod("manual")` → 0 days
2. `getHoldPeriod("rotessa_pad")` → 5 days
3. `getHoldPeriod("stripe_ach")` → 7 days
4. `getHoldPeriod("unknown_method")` → 5 days (default)
5. `calculatePayoutEligibleDate("2026-03-20", "manual")` → "2026-03-20" (same day)
6. `calculatePayoutEligibleDate("2026-03-20", "rotessa_pad")` → "2026-03-27" (Friday + 5 bd = Friday)
7. `calculatePayoutEligibleDate("2026-03-20", "stripe_ach")` → "2026-03-31" (Friday + 7 bd = Tuesday)
