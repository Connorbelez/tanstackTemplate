# Chunk Context: tests-and-verification

Source: Linear ENG-83, ENG-86 test plan page, existing auth/resource-check coverage, and repo test patterns.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Linear Issue / Requirement Excerpts

```md
### Auth

All wrapped in `authedQuery`. Investors can only query their own data (resource ownership check).
```

```md
Acceptance Criteria
1. Undisbursed: 3 entries (\$100+\$200+\$150) = \$450; empty = \$0
2. History: date range filtering returns correct subset
3. Cross-check: total accrual ≈ dispersals + fees (within 1-day tolerance)
4. All queries use authedQuery middleware
5. Pagination supported for large result sets
```

## ENG-86 Test Plan Excerpts

```md
Test the dispersal reconciliation queries: undisbursed balance, disbursement history with date filtering, servicing fee history, and the cross-check invariant that accrual ≈ dispersals + fees over time.
```

```md
Step 1: Create reconciliation.test.ts
- Seed helpers: create dispersalEntries and servicingFeeEntries directly
- `describe("getUndisbursedBalance")`: 3 pending entries sum correctly, no entries returns \$0
- `describe("getDisbursementHistory")`: seed entries across date range, verify filtering works, empty range returns empty
- `describe("getServicingFeeHistory")`: 3 monthly entries, verify total and individual amounts
- `describe("cross-check invariant")`: seed mortgage + lender + ownership, run 3 monthly settlements via createDispersalEntries, compute 3-month accrual, assert accrual ≈ dispersals + fees within 1 day's accrual tolerance
```

```md
Constraints & Gotchas
- Query implementations must exist — `getUndisbursedBalance`, `getDisbursementHistory`, `getServicingFeeHistory` are defined in SPEC §7 and must be implemented before or alongside these tests
- Direct seeding for simple tests — undisbursed/history tests can seed `dispersalEntries` directly without going through `createDispersalEntries`
- `lenderId` not `investorId` in all query args and assertions
```

## Existing Auth / Access Tests

```ts
describe("canAccessDispersal", () => {
  it("admin — always true", async () => { ... });
  it("lender — own investorId — true", async () => { ... });
  it("lender — other investorId — false", async () => { ... });
  it("broker — no access even if lender belongs to broker", async () => { ... });
});
```

```ts
export const testDispersalQuery = authedQuery
  .use(requirePermission("dispersal:view"))
  .handler(async () => okResponse())
  .public();
```

## Repo Test Patterns

```ts
const modules = import.meta.glob("/convex/**/*.ts");

export function createTestHarness() {
  return convexTest(schema, modules);
}

export function asLedgerUser(t: TestHarness) {
  return t.withIdentity(LEDGER_TEST_IDENTITY);
}
```

```md
Use `convex-test` for query-level tests, seed rows directly with `t.run(async (ctx) => ctx.db.insert(...))`, and use `.withIdentity(...)` to exercise the auth middleware and permission/resource checks.
```

## Quality Gate Requirements

```md
- Run `bun check` before hand-fixing lint or formatting issues.
- `bun check`, `bun typecheck`, and `bunx convex codegen` must pass before considering the issue complete.
- Do not introduce `any`.
```

## Execution Assumption

```md
ENG-83 is query scope. Keep the cross-check portion of ENG-86 optional for this issue unless the underlying dispersal mutation already exists on this branch during execution.
If the mutation is still a stub, fully cover the ENG-83 query contract and leave the end-to-end accrual/dispersal invariant to ENG-86 / ENG-82 follow-up work.
```
