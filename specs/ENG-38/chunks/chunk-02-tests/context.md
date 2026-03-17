# Chunk 02 Context: Test Expansion

## Test File Location
`convex/ledger/__tests__/ledger.test.ts`

## Existing Test Structure (Point-in-Time section, starts ~line 1088)
Tests are in a `describe("Point-in-Time & History")` block. Existing tests:
- T-067: getPositionsAt pre-transfer state
- T-068: getBalanceAt at various timestamps
- T-069: getMortgageHistory in sequence order
- T-069b: getMortgageHistory date range filter
- T-070: getAccountHistory entries touching an account

**NOTE: T-070 already exists in the codebase as `getAccountHistory` test. The implementation plan's new tests should use T-070a/b or follow the existing numbering. Check what test IDs exist and use the next available IDs.**

## Test Helpers Used (from the existing tests)

```typescript
const t = createTestHarness();       // Creates convex-test environment
await initCounter(t);                 // Initializes sequence counter
const auth = asLedgerUser(t);        // Creates auth context with ledger:view permission

// Mint and issue helper
const { treasuryAccountId, positionAccountId } = await mintAndIssue(t, "m1", "lender-a");
```

## API References
```typescript
import { api } from "../../../convex/_generated/api";

// Queries
api.ledger.queries.getPositionsAt    // { mortgageId: string, asOf: number }
api.ledger.queries.getBalanceAt      // { accountId: Id<"ledger_accounts">, asOf: number }

// Mutations
api.ledger.mutations.transferShares  // { mortgageId, sellerLenderId, buyerLenderId, amount, effectiveDate, idempotencyKey, source }
api.ledger.mutations.redeemShares    // { mortgageId, lenderId, amount, effectiveDate, idempotencyKey, source }
```

## Source Object Pattern
```typescript
const SYS_SOURCE = { type: "SYSTEM" as const, detail: "test" };
```

## Test Code from Implementation Plan

### T-070a: Multi-step transfer sequence with intermediate queries
```typescript
it("T-070a: multi-step transfer sequence, query at intermediate points", async () => {
  const t = createTestHarness();
  await initCounter(t);
  const auth = asLedgerUser(t);

  // Step 1: Mint and issue to lender-a (10,000 units)
  await mintAndIssue(t, "m1", "lender-a");
  const afterIssue = Date.now();
  await new Promise((r) => setTimeout(r, 10));

  // Step 2: Transfer 5,000 from lender-a → lender-b
  await auth.mutation(api.ledger.mutations.transferShares, {
    mortgageId: "m1",
    sellerLenderId: "lender-a",
    buyerLenderId: "lender-b",
    amount: 5_000,
    effectiveDate: "2026-01-02",
    idempotencyKey: "transfer-1",
    source: SYS_SOURCE,
  });
  const afterTransfer1 = Date.now();
  await new Promise((r) => setTimeout(r, 10));

  // Step 3: Transfer 2,000 from lender-b → lender-c
  await auth.mutation(api.ledger.mutations.transferShares, {
    mortgageId: "m1",
    sellerLenderId: "lender-b",
    buyerLenderId: "lender-c",
    amount: 2_000,
    effectiveDate: "2026-01-03",
    idempotencyKey: "transfer-2",
    source: SYS_SOURCE,
  });

  // Query at afterIssue: only lender-a with 10,000
  const positionsAtIssue = await auth.query(
    api.ledger.queries.getPositionsAt,
    { mortgageId: "m1", asOf: afterIssue }
  );
  expect(positionsAtIssue).toHaveLength(1);
  expect(positionsAtIssue[0].lenderId).toBe("lender-a");
  expect(positionsAtIssue[0].balance).toBe(10_000n);

  // Query at afterTransfer1: lender-a 5,000 + lender-b 5,000
  const positionsAtT1 = await auth.query(
    api.ledger.queries.getPositionsAt,
    { mortgageId: "m1", asOf: afterTransfer1 }
  );
  expect(positionsAtT1).toHaveLength(2);
  const t1Map = Object.fromEntries(
    positionsAtT1.map((p) => [p.lenderId, p.balance])
  );
  expect(t1Map["lender-a"]).toBe(5_000n);
  expect(t1Map["lender-b"]).toBe(5_000n);

  // Query at now: lender-a 5,000 + lender-b 3,000 + lender-c 2,000
  const positionsNow = await auth.query(
    api.ledger.queries.getPositionsAt,
    { mortgageId: "m1", asOf: Date.now() }
  );
  expect(positionsNow).toHaveLength(3);
  const nowMap = Object.fromEntries(
    positionsNow.map((p) => [p.lenderId, p.balance])
  );
  expect(nowMap["lender-a"]).toBe(5_000n);
  expect(nowMap["lender-b"]).toBe(3_000n);
  expect(nowMap["lender-c"]).toBe(2_000n);
});
```

### T-071: Determinism across multiple runs
```typescript
it("T-071: determinism — same query returns identical results across multiple calls", async () => {
  const t = createTestHarness();
  await initCounter(t);
  const auth = asLedgerUser(t);
  await mintAndIssue(t, "m1", "lender-a");

  await auth.mutation(api.ledger.mutations.transferShares, {
    mortgageId: "m1",
    sellerLenderId: "lender-a",
    buyerLenderId: "lender-b",
    amount: 4_000,
    effectiveDate: "2026-01-02",
    idempotencyKey: "transfer-det",
    source: SYS_SOURCE,
  });

  const asOf = Date.now();

  // Call 5 times, assert identical
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      auth.query(api.ledger.queries.getPositionsAt, {
        mortgageId: "m1",
        asOf,
      })
    )
  );

  for (let i = 1; i < results.length; i++) {
    expect(results[i]).toEqual(results[0]);
  }
});
```

### T-072: Audit-only entries excluded (skipped)
```typescript
it.skip("T-072: SHARES_RESERVED entries excluded from point-in-time replay (requires ENG-34)", async () => {
  // When ENG-34 lands, unskip this test:
  // 1. Mint+issue to lender-a
  // 2. reserveShares (lender-a → lender-b)
  // 3. getPositionsAt should show lender-a with FULL balance (reservation is pending)
  // 4. commitReservation
  // 5. getPositionsAt should now show split
});
```

### T-073: getBalanceAt lifecycle tracking
```typescript
it("T-073: getBalanceAt tracks balance evolution across lifecycle", async () => {
  const t = createTestHarness();
  await initCounter(t);
  const auth = asLedgerUser(t);

  const { treasuryAccountId, positionAccountId } = await mintAndIssue(
    t, "m1", "lender-a"
  );
  const afterIssue = Date.now();
  await new Promise((r) => setTimeout(r, 10));

  await auth.mutation(api.ledger.mutations.redeemShares, {
    mortgageId: "m1",
    lenderId: "lender-a",
    amount: 3_000,
    effectiveDate: "2026-02-01",
    idempotencyKey: "redeem-1",
    source: SYS_SOURCE,
  });
  const afterRedeem = Date.now();

  // Position after issue: 10,000
  const posAfterIssue = await auth.query(
    api.ledger.queries.getBalanceAt,
    { accountId: positionAccountId, asOf: afterIssue }
  );
  expect(posAfterIssue).toBe(10_000n);

  // Position after redeem: 7,000
  const posAfterRedeem = await auth.query(
    api.ledger.queries.getBalanceAt,
    { accountId: positionAccountId, asOf: afterRedeem }
  );
  expect(posAfterRedeem).toBe(7_000n);

  // Treasury tracks inversely
  const treasuryAfterIssue = await auth.query(
    api.ledger.queries.getBalanceAt,
    { accountId: treasuryAccountId, asOf: afterIssue }
  );
  expect(treasuryAfterIssue).toBe(0n);

  const treasuryAfterRedeem = await auth.query(
    api.ledger.queries.getBalanceAt,
    { accountId: treasuryAccountId, asOf: afterRedeem }
  );
  expect(treasuryAfterRedeem).toBe(3_000n);
});
```

## Key Constraints
- Tests use `convex-test` framework with `createTestHarness()` / `asLedgerUser()` pattern
- `SYS_SOURCE` is defined locally in tests as `{ type: "SYSTEM" as const, detail: "test" }`
- `mintAndIssue` returns `{ treasuryAccountId, positionAccountId }`
- All tests go in the existing "Point-in-Time & History" describe block
- Balance values are `bigint` (use `10_000n` syntax)
- Check existing test IDs to avoid conflicts — use next available numbers
