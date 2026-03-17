# Chunk Context: Tests

Source: Linear ENG-28, Notion implementation plan.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

### Test Requirements
Create `convex/ledger/__tests__/accounts.test.ts` with unit tests for each helper function. Reuse existing test patterns from `ledger.test.ts`.

### Test Cases

1. **getPostedBalance**
   - Zero account (debits == credits == 0n) → returns 0n
   - Account with debits > credits → returns positive bigint
   - Account with credits > debits → returns negative bigint

2. **getAvailableBalance**
   - Account without pendingCredits field → same as posted balance
   - Account with pendingCredits → posted - pendingCredits
   - Account with pendingCredits == 0n → same as posted balance

3. **getWorldAccount**
   - Throws when no WORLD account exists
   - Returns WORLD account when it exists

4. **initializeWorldAccount**
   - Creates WORLD account on first call
   - Returns existing WORLD on second call (idempotent)
   - Created account has correct initial values (type=WORLD, debits=0, credits=0)

5. **getTreasuryAccount**
   - Returns null when no TREASURY for the mortgage
   - Returns the TREASURY account when it exists

6. **getOrCreatePositionAccount**
   - Creates new POSITION on first call
   - Returns existing POSITION on second call
   - Created account has correct initial values (type=POSITION, mortgageId set, lenderId set)

## Existing Test Harness (from ledger.test.ts)

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../_generated/api";
import { FAIRLEND_STAFF_ORG_ID } from "../../constants";
import schema from "../../schema";

const modules = import.meta.glob("/convex/**/*.ts");

const LEDGER_TEST_IDENTITY = {
  subject: "test-ledger-user",
  issuer: "https://api.workos.com",
  org_id: FAIRLEND_STAFF_ORG_ID,
  organization_name: "FairLend Staff",
  role: "admin",
  roles: JSON.stringify(["admin"]),
  permissions: JSON.stringify(["ledger:view", "ledger:correct"]),
  user_email: "ledger-test@fairlend.ca",
  user_first_name: "Ledger",
  user_last_name: "Tester",
};

function createTestHarness() {
  return convexTest(schema, modules);
}

function asLedgerUser(t: ReturnType<typeof createTestHarness>) {
  return t.withIdentity(LEDGER_TEST_IDENTITY);
}

const SYS_SOURCE = { type: "system" as const, channel: "test" };
const ADMIN_SOURCE = { type: "user" as const, actor: "admin-1", channel: "admin" };
```

### Testing pattern for internal helper functions
Since `getWorldAccount`, `initializeWorldAccount`, `getTreasuryAccount`, and `getOrCreatePositionAccount` are NOT exposed as Convex mutations/queries, tests must exercise them via:
1. **Direct import + `convex-test` `run()` method** — use `t.run(async (ctx) => { ... })` to get a MutationCtx/QueryCtx and call the helpers directly
2. **Indirect via exposed mutations** — call `mintMortgage` which internally uses `initializeWorldAccount` and creates TREASURY, then verify state

Preferred approach: Use `t.run()` for direct unit testing of helpers.

```typescript
// Example pattern:
it("getWorldAccount throws when no WORLD exists", async () => {
  const t = createTestHarness();
  await t.run(async (ctx) => {
    await expect(getWorldAccount(ctx)).rejects.toThrow("WORLD account not found");
  });
});

it("initializeWorldAccount creates WORLD idempotently", async () => {
  const t = createTestHarness();
  await t.run(async (ctx) => {
    const first = await initializeWorldAccount(ctx);
    expect(first.type).toBe("WORLD");
    expect(first.cumulativeDebits).toBe(0n);

    const second = await initializeWorldAccount(ctx);
    expect(second._id).toBe(first._id);
  });
});
```

## Key Type Signatures Being Tested
```typescript
getPostedBalance(account: Pick<Doc<"ledger_accounts">, "cumulativeDebits" | "cumulativeCredits">): bigint
getAvailableBalance(account: Pick<Doc<"ledger_accounts">, "cumulativeDebits" | "cumulativeCredits" | "pendingCredits">): bigint
getWorldAccount(ctx: QueryCtx): Promise<Doc<"ledger_accounts">>
initializeWorldAccount(ctx: MutationCtx): Promise<Doc<"ledger_accounts">>
getTreasuryAccount(ctx: QueryCtx, mortgageId: string): Promise<Doc<"ledger_accounts"> | null>
getOrCreatePositionAccount(ctx: MutationCtx, mortgageId: string, lenderId: string): Promise<Doc<"ledger_accounts">>
```

## Constraints
- Tests use `convex-test` framework with `vitest`
- Reuse `LEDGER_TEST_IDENTITY`, `createTestHarness`, `asLedgerUser` patterns
- Pure functions (getPostedBalance, getAvailableBalance) can be tested without convex-test context
- Async helpers need `t.run()` for direct testing
- Also verify `ledger.test.ts` still passes (no broken imports from renamed functions)
- Run `bunx convex codegen`, `bun check`, `bun typecheck`, `bun run test` at end
