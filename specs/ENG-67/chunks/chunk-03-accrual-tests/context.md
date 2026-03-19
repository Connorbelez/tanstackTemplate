# Chunk 03 Context: Integration Verification

Source: Linear `ENG-67`, Notion implementation plan + linked pages, and verified local test patterns.

## Acceptance Criteria

> - Complete test coverage
> - Accrual computation is deterministic and reproducible
> - Portfolio-level accrual aggregation

## Implementation Plan Excerpt

> `convex/accrual/__tests__/ownershipPeriods.test.ts` — Period derivation tests with convex-test
>
> `convex/accrual/__tests__/proration.test.ts` — Verifies closing-date-to-seller rule
>
> `convex/accrual/__tests__/accrual.integration.test.ts` — End-to-end with seeded data

## Spec Testing Excerpts

> **Full chain:**
> 1. Seed `$100K @ 10%` with A(60%), B(40%)
> 2. Query 30-day accrual → A=`$493.15`, B=`$328.77`
> 3. Settle `$833.33`
> 4. Undisbursed: A=`$450`, B=`$300`

> **Deal close:**
> 1. Seed with A(100%)
> 2. Day 15: 50% to B
> 3. A's month accrual: 15d@100% + 16d@50%
> 4. B's month accrual: 16d@50%

> **Ownership period tests:**
> Single owner, deal close, multiple transfers, full exit.

## Verified Local Test Pattern Excerpts

```typescript
// convex/ledger/__tests__/queries.test.ts
const modules = import.meta.glob("/convex/**/*.ts");

function createTestHarness() {
  return convexTest(schema, modules);
}

function asLedgerUser(t: ReturnType<typeof createTestHarness>) {
  return t.withIdentity(LEDGER_TEST_IDENTITY);
}
```

```typescript
// src/test/auth/helpers.ts
export function createTestConvex() {
  const t = convexTest(schema, modules);
  auditLogTest.register(t, "auditLog");
  t.registerComponent("auditTrail", auditTrailSchema, auditTrailModules);
  t.registerComponent("workflow", workflowSchema, workflowModules);
  t.registerComponent("workflow/workpool", workpoolSchema, workpoolModules);
  return t;
}
```

```typescript
// src/test/convex/engine/helpers.ts
export async function seedMortgage(
  t: GovernedTestConvex,
): Promise<Id<"mortgages">> {
  return t.run(async (ctx) =>
    ctx.db.insert("mortgages", {
      status: "active",
      principal: 500_000_00,
      interestRate: 5.5,
      termStartDate: "2026-01-15",
      // ...
    })
  );
}
```

## Linear Audit Notes

> `convex/accrual/__tests__/interestMath.test.ts` — comprehensive tests
>
> Still needed:
> - `convex/accrual/__tests__/ownershipPeriods.test.ts`
> - `convex/accrual/__tests__/proration.test.ts`
> - `convex/accrual/__tests__/accrual.integration.test.ts`

## Constraints & Rules

> - `bun check`, `bun typecheck` and `bunx convex codegen` must pass before considering tasks completed.
> - After Completing a Major unit of work like a full SPEC run `coderabbit review --plain`.

## File Structure

```text
convex/
  accrual/
    __tests__/
      ownershipPeriods.test.ts
      proration.test.ts
      accrual.integration.test.ts
```
