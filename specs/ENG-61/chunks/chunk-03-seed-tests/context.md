# Chunk 3 Context: Seed + Tests + Validation

## T-009: Seed Mutation (convex/payments/collectionPlan/seed.ts)

### Seed Data
```typescript
const DEFAULT_RULES = [
  {
    name: "schedule_rule",
    trigger: "schedule" as const,
    action: "create_plan_entry",
    parameters: { delayDays: 5 },
    priority: 10,
    enabled: true,
  },
  {
    name: "retry_rule",
    trigger: "event" as const,
    action: "create_retry_entry",
    parameters: { maxRetries: 3, backoffBaseDays: 3 },
    priority: 20,
    enabled: true,
  },
  {
    name: "late_fee_rule",
    trigger: "event" as const,
    action: "create_late_fee",
    parameters: { feeAmountCents: 5000, dueDays: 30, graceDays: 45 },
    priority: 30,
    enabled: true,
  },
];
```

### Pattern
- Use `internalMutation` (this is internal infra, not user-facing admin action)
- Idempotent: check if rule with `name` already exists before inserting
- Set `createdAt: Date.now()` and `updatedAt: Date.now()` on each rule
- Return count of created vs skipped rules

### Schema Reference (collectionRules)
```typescript
collectionRules: defineTable({
  name: v.string(),
  trigger: v.union(v.literal("schedule"), v.literal("event")),
  condition: v.optional(v.any()),
  action: v.string(),
  parameters: v.optional(v.any()),
  priority: v.number(),
  enabled: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_trigger", ["trigger", "enabled", "priority"]),
```

## T-010: Rules Engine Tests (convex/payments/__tests__/rules.test.ts)

### Test Framework: convex-test + vitest

The project uses `convex-test` for integration tests with a real Convex test environment.

**Existing test pattern** (from `convex/payments/__tests__/methods.test.ts`):
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

For rules engine tests, since we're testing `internalAction` and `internalMutation` functions that interact with the database, we should use `convex-test` for a more realistic test environment.

However, the rule handlers themselves are pure TypeScript objects (RuleHandler interface) that call `ctx.runQuery` and `ctx.runMutation`. We can unit test the handlers by mocking `ctx`.

### Test Cases

**Engine Tests:**
1. Engine respects priority ordering: seed rules with different priorities, verify handler execution order
2. Engine skips disabled rules: set rule `enabled: false`, verify handler not called
3. Engine filters by trigger type: schedule rules not called for event triggers and vice versa
4. Engine skips rules without registered handlers: unknown rule name → logged warning, continues

**ScheduleRule Tests:**
5. Creates plan entry for obligation due within window
6. Idempotency: existing plan entry → no duplicate created
7. Respects delayDays parameter: obligation too far in future → no entry created
8. Uses "manual" as default method

**RetryRule Tests:**
9. Creates retry entry on COLLECTION_FAILED with correct backoff
10. Respects maxRetries: retryCount >= maxRetries → no entry
11. Exponential backoff: verify delay pattern (3, 6, 12 days)
12. Ignores non-COLLECTION_FAILED events

**LateFeeRule Tests:**
13. Creates late_fee obligation on OBLIGATION_OVERDUE
14. Idempotency: existing late fee for same source obligation → no duplicate
15. Correct parameters: amount=5000, dueDate=+30d, gracePeriod=+45d
16. Ignores non-OBLIGATION_OVERDUE events

### Mocking Strategy

Since rule handlers use `ctx.runQuery` and `ctx.runMutation` (action context), mock the ActionCtx:

```typescript
function createMockActionCtx(overrides?: Partial<MockOverrides>) {
  const queryResults = new Map<string, unknown>();
  const mutations: Array<{ ref: string; args: unknown }> = [];

  return {
    ctx: {
      runQuery: vi.fn(async (ref: unknown, args: unknown) => {
        // Return pre-configured query results
        return queryResults.get(String(ref)) ?? null;
      }),
      runMutation: vi.fn(async (ref: unknown, args: unknown) => {
        mutations.push({ ref: String(ref), args });
        return "mock_id";
      }),
    } as unknown as ActionCtx,
    queryResults,
    mutations,
  };
}
```

### Schema for test data

**obligations test data:**
```typescript
{
  status: "upcoming",
  mortgageId: "mortgage_123" as Id<"mortgages">,
  borrowerId: "borrower_456" as Id<"borrowers">,
  paymentNumber: 1,
  type: "regular_interest",
  amount: 100_000, // $1000
  amountSettled: 0,
  dueDate: Date.now() + 3 * 86400000, // 3 days from now
  gracePeriodEnd: Date.now() + 18 * 86400000,
  createdAt: Date.now(),
}
```

**collectionRules test data:**
```typescript
{
  _id: "rule_1" as Id<"collectionRules">,
  name: "schedule_rule",
  trigger: "schedule",
  action: "create_plan_entry",
  parameters: { delayDays: 5 },
  priority: 10,
  enabled: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}
```

## T-011: Full Validation

Run in order:
1. `bun check` — lint + format (auto-fixes first)
2. `bun typecheck` — TypeScript type checking
3. `bunx convex codegen` — generate Convex types
4. `bun run test convex/payments/__tests__/rules.test.ts` — run the new tests

## Import Patterns
```typescript
// For test files
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
```

## Key Constraints
- No `any` types in TypeScript
- Run `bun check` BEFORE fixing lint errors manually
- Tests must cover all acceptance criteria from the Linear issue
- Seed mutation must be idempotent
