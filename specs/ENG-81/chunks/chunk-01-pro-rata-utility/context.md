# Chunk Context: pro-rata-utility

Source: Linear ENG-81, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt
````md
## 1. Goal
Implement the largest-remainder rounding algorithm for distributing payments across multiple lenders. Guarantees that the sum of rounded shares equals the distributable total to the cent — critical for financial accuracy.

## 3. Requirements
### Acceptance Criteria
- [ ] 3 investors (3333/3333/3334 units), \$10.00 → \$3.33, \$3.33, \$3.34
- [ ] 2 investors (5000/5000 units), \$100.01 → \$50.01, \$50.00
- [ ] Any N investors, any amount: sum === distributable

### Derived Requirements
- Tie-break by largest position (most units)
- Must use `lenderId` and `Id<"ledger_accounts">` (not SPEC's `investorId` / `Id<"accounts">`)
- Return type must include `rawAmount` for audit trail

## 4. Architecture & Design
### File Map
| File | Action | Purpose |
| --- | --- | --- |
| `convex/accrual/interestMath.ts` | Modify (add function) | `calculateProRataShares()` — shared utility per SPEC |

Note: SPEC places this in `accrual/interestMath.ts` as a shared utility, even though it's used by dispersal. This keeps all financial math in one module.

### Key Design Decisions
1. **Largest-remainder method** — industry-standard for cent-exact distribution
2. **Placed in accrual/interestMath.ts** — per SPEC, shared utility across accrual and dispersal
3. **Tie-break by largest position** — deterministic ordering for equal remainders

### Data Structures
```typescript
// Types (add to convex/accrual/types.ts or inline)
export type PositionShare = {
  accountId: Id<"ledger_accounts">;  // SPEC says Id<"accounts">
  lenderId: Id<"lenders">;           // SPEC says investorId
  units: number;
  rawAmount: number;
  amount: number;                     // rounded to cent
};

// In convex/accrual/interestMath.ts
export function calculateProRataShares(
  positions: Array<{
    accountId: Id<"ledger_accounts">;
    lenderId: Id<"lenders">;
    units: number;
  }>,
  distributableAmount: number,
): PositionShare[];
```

## 6. Implementation Steps
### Step 1: Add PositionShare type
- **File(s):** `convex/accrual/types.ts`
- **Action:** Add `PositionShare` type export
- **Details:** `{ accountId: Id<"ledger_accounts">, lenderId: Id<"lenders">, units: number, rawAmount: number, amount: number }`
- **Depends on:** ENG-69 (types.ts must exist)

### Step 2: Implement calculateProRataShares
- **File(s):** `convex/accrual/interestMath.ts`
- **Action:** Add function to existing file
- **Details:**
	1. Calculate `totalUnits = positions.reduce((sum, p) => sum + p.units, 0)`
	2. For each position: `rawAmount = (units / totalUnits) * distributableAmount`
	3. Floor each: `flooredAmount = Math.floor(rawAmount * 100) / 100`
	4. Calculate remaining cents: `distributableCents - flooredCents`
	5. Sort by remainder descending, tie-break by units descending
	6. Distribute remaining cents one at a time to largest remainders
	7. Return shares without the `remainder` internal field
- **Validation:** 3 investors (3333/3333/3334), \$10.00 → \$3.33, \$3.33, \$3.34; sum always equals distributable
- **Depends on:** Step 1, ENG-69 (interestMath.ts must exist)

## 7. Constraints & Gotchas
- **Sum invariant is non-negotiable** — `shares.reduce((s, x) => s + x.amount, 0)` must equal `distributableAmount` to the cent
- **Floating-point danger** — use `Math.round(x * 100)` to convert to cents for comparison, not direct float equality
- **The remainder field is internal** — strip it from the return type (used only for sorting)
- **ENG-69 must be complete first** — this adds to an existing file created by ENG-69
- **`lenderId` not `investorId`** — adapt from SPEC naming
````

## SPEC Excerpt
````md
### 4.3 Pro-Rata Share Calculation with Largest-Remainder Rounding
```typescript
// accrual/interestMath.ts (shared utility)

/**
 * Largest-remainder method:
 * 1. Calculate each investor's exact (sub-cent) share
 * 2. Floor each to nearest cent
 * 3. Sort by fractional remainder descending
 * 4. Distribute remaining cents one-at-a-time to largest remainders
 * Guarantees: sum of rounded shares === distributable (to the cent)
 */
export function calculateProRataShares(
  positions: { accountId: Id<"accounts">; investorId: Id<"investors">; units: number }[],
  distributableAmount: number,
): PositionShare[] {
  const totalUnits = positions.reduce((sum, p) => sum + p.units, 0);

  const shares = positions.map(p => {
    const rawAmount = (p.units / totalUnits) * distributableAmount;
    const flooredAmount = Math.floor(rawAmount * 100) / 100;
    return {
      accountId: p.accountId, investorId: p.investorId, units: p.units,
      rawAmount, amount: flooredAmount,
      remainder: rawAmount - flooredAmount,
    };
  });

  const distributableCents = Math.round(distributableAmount * 100);
  const flooredCents = Math.round(shares.reduce((s, x) => s + x.amount, 0) * 100);
  let remainingCents = distributableCents - flooredCents;

  // Sort by remainder desc, tie-break by largest position
  shares.sort((a, b) =>
    Math.abs(b.remainder - a.remainder) > 1e-10
      ? b.remainder - a.remainder
      : b.units - a.units
  );

  for (const share of shares) {
    if (remainingCents <= 0) break;
    share.amount = Math.round((share.amount + 0.01) * 100) / 100;
    remainingCents--;
  }

  return shares.map(({ remainder, ...rest }) => rest);
}
```
````

## Integration Points
```md
### Downstream (blocks)
- **ENG-82**: createDispersalEntries mutation — Backlog
	- Calls `calculateProRataShares()` in step 6 to distribute settled amounts
```

```md
## 1. Goal
Test the core dispersal pipeline (`createDispersalEntries` mutation from ENG-82). Covers happy path distribution, largest-remainder rounding, idempotency, error cases, and servicing fee correctness.

## 3. Requirements
### Acceptance Criteria
**Rounding:**
- [ ] 3 lenders (3333/3333/3334), \$10 → \$3.33/\$3.33/\$3.34
- [ ] Equal lenders with odd cent

## 4. Architecture & Design
### Integration Points
- **Tests:** `createDispersalEntries` from `../createDispersalEntries`
- **Reads:** `dispersalEntries` table (by_obligation index), `servicingFeeEntries` table
- **Schema drift:** `dispersalEntries.lenderId` (not `investorId`), `dispersalEntries.lenderAccountId` (not `investorAccountId`)
```

## Existing Repo State
```ts
// convex/accrual/types.ts
import type { Id } from "../_generated/dataModel";

export interface OwnershipPeriod {
	fraction: number;
	fromDate: string;
	lenderId: Id<"lenders">;
	mortgageId: Id<"mortgages">;
	toDate: string | null;
}

export interface AccrualResult {
	accruedInterest: number;
	fromDate: string;
	lenderId: Id<"lenders">;
	mortgageId: Id<"mortgages">;
	periods: Array<{
		fraction: number;
		fromDate: string;
		toDate: string;
	}>;
	toDate: string;
}
```

```ts
// convex/accrual/interestMath.ts
import type { OwnershipPeriod } from "./types";

export function calculatePeriodAccrual(
	annualRate: number,
	fraction: number,
	principalBalance: number,
	days: number
): number {
	return (annualRate * fraction * principalBalance * days) / 365;
}

export function calculateAccrualForPeriods(
	periods: OwnershipPeriod[],
	annualRate: number,
	principalBalance: number,
	fromDate: string,
	toDate: string
): number {
	if (fromDate > toDate) {
		throw new Error(
			`calculateAccrualForPeriods: fromDate ${fromDate} is after toDate ${toDate}`
		);
	}

	let total = 0;

	for (const period of periods) {
		const effectiveFrom = maxDate(period.fromDate, fromDate);
		const effectiveTo = minDate(period.toDate ?? toDate, toDate);

		if (effectiveFrom > effectiveTo) {
			continue;
		}

		const days = daysBetween(effectiveFrom, effectiveTo);
		total += calculatePeriodAccrual(
			annualRate,
			period.fraction,
			principalBalance,
			days
		);
	}

	return total;
}
```

```ts
// convex/accrual/__tests__/interestMath.test.ts
import {
	calculateAccrualForPeriods,
	calculatePeriodAccrual,
	dayAfter,
	dayBefore,
	daysBetween,
	maxDate,
	minDate,
} from "../interestMath";
import type { OwnershipPeriod } from "../types";
```
