# Chunk Context: tests-and-verification

Source: Linear `ENG-68`, Notion implementation plan v2, ENG-85, ENG-86, and verified local test patterns.
This file and the accompanying `tasks.md` contain everything needed to implement this chunk.

## Implementation Plan Excerpt

```md
## 🧪 Test Plan
Create `convex/dispersal/__tests__/createDispersalEntries.test.ts`:
- Single lender: 100%, settled $833.33, fee $83.33 → entry $750.00
- Multiple lenders: A=60%, B=40%, distributable $750 → A=$450, B=$300
- Rounding: 3 lenders (3333/3333/3334), $10.00 distributable → $3.33, $3.33, $3.34
- Idempotency: second call returns existing, no new writes
- Error: settledAmount < servicing fee → throws
- Error: no active positions → throws
```

```md
Create `convex/dispersal/__tests__/calculateProRataShares.test.ts`:
- Largest-remainder: exact cents distributed, sum === distributable
- Edge: 2 investors (50/50), $100 → $50, $50
- Edge: 3 investors (3333/3333/3334), $10.00 → $3.33, $3.33, $3.34
- Edge: single investor, 100% → exact amount (no rounding loss)
```

```md
Create `convex/dispersal/__tests__/reconciliation.test.ts`:
- getUndisbursedBalance: 3 entries ($100, $200, $150) → $450
- getDisbursementHistory: date-range filtering
- getServicingFeeHistory: total fees = sum of entries
```

## ENG-85 Excerpt

```md
### Acceptance Criteria
**Happy path:**
- Single lender 100%/$833.33 → $750 entry (after $83.33 servicing fee)
- Multi-lender 60/40 → $450/$300

**Rounding:**
- 3 lenders (3333/3333/3334), $10 → $3.33/$3.33/$3.34

**Idempotency:**
- Second call same obligationId → existing returned, no new writes

**Errors:**
- settledAmount <= servicingFee → ConvexError
- No active positions → ConvexError
```

```md
### Key Design Decisions
1. **Full `convex-test` harness** — tests call the `internalMutation` directly
2. **Seed mortgage + active positions** — create ledger_accounts with positive balances
3. **Schema field names** — `lenderId`, `lenderAccountId`, `mortgage.principal`, `mortgage.interestRate`
```

## ENG-86 Excerpt

```md
### Acceptance Criteria
**Undisbursed:**
- 3 entries ($100, $200, $150) → $450
- No entries → $0

**History:**
- Date range filtering returns correct subset
- Empty range → empty

**Servicing fees:**
- 3 months → correct total
- Individual entries match calculation
```

```md
### Constraints & Gotchas
- Cross-check tolerance — SPEC allows "within 1 day tolerance"
- Direct seeding for simple tests — undisbursed/history tests can seed `dispersalEntries` directly without going through `createDispersalEntries`
- `lenderId` not `investorId` in all query args and assertions
```

## Repo Verification Snippets

```ts
// convex/dispersal/__tests__/servicingFee.test.ts
import { describe, expect, it } from "vitest";
import { calculateServicingFee } from "../servicingFee";

describe("calculateServicingFee", () => {
  it("$100K @ 1% → $83.33/mo", () => {
    expect(calculateServicingFee(0.01, 100_000)).toBe(83.33);
  });
});
```

```ts
// convex/ledger/__tests__/queries.test.ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

function createTestHarness() {
  return convexTest(schema, modules);
}
```

```ts
// convex/deals/__tests__/effects.test.ts
beforeEach(() => {
  t = convexTest(schema, modules);
});

it("idempotency: existing reroute for dealId — skips", async () => {
  ...
});
```

## Verification Rules

```md
- `bun check`, `bun typecheck` and `bunx convex codegen` must pass before considering tasks completed.
- DO NOT try to fix linting/formatting errors BEFORE running `bun check`.
- After Completing a Major unit of work like a full SPEC run `coderabbit review --plain` to get a code review summary.
```
