# Context for Chunk 01: Fix validateSupplyInvariant + Add Missing Tests

## Linear Issue: ENG-31
**Title:** Implement burnMortgage convenience mutation — discharge and close mortgage

## What Needs to Happen
The `burnMortgage` mutation already works correctly. Two things are broken/missing:

1. **CRITICAL BUG**: `validateSupplyInvariant` returns `valid: false` after a successful burn. It must return `valid: true, total: 0` when a mortgage has been burned (treasury exists with balance 0, all positions are 0).
2. **Missing Tests**: Double-burn idempotency test and post-burn invariant validation test.

## Acceptance Criteria (from Linear)
- [x] Posts MORTGAGE_BURNED entry: TREASURY → WORLD, amount = 10,000
- [x] Precondition: TREASURY balance MUST == 10,000
- [x] Precondition: ALL POSITIONs for this mortgage MUST == 0
- [x] Post-burn: WORLD balance restored, TREASURY = 0, all records preserved
- [ ] **validateSupplyInvariant returns valid: true, total: 0 after burn** ← FIX THIS
- [x] Auth: adminMutation (admin role required)
- [x] Rejects if any POSITION > 0 or TREASURY != 10,000 with structured ConvexError
- [ ] **Tests: happy path (full lifecycle to burn), premature burn rejection, double-burn idempotency** ← ADD MISSING TESTS

## File: convex/ledger/queries.ts (lines 109-153) — validateSupplyInvariant

Current code returns valid based on:
```typescript
valid: total === TOTAL_SUPPLY || (isUnminted && total === 0n)
```

Where `isUnminted = treasury == null && positions.length === 0`.

**Problem:** After burn, treasury exists (not null) with balance 0, all positions are 0, total = 0. Neither condition is true:
- `total === TOTAL_SUPPLY` → `0n === 10000n` → false
- `isUnminted && total === 0n` → `false && true` → false (treasury exists, so isUnminted is false)

**Fix:** Add `isBurned` condition:
```typescript
const isBurned = treasury != null && treasuryBalance === 0n && positionTotal === 0n;
return {
  valid: total === TOTAL_SUPPLY || (isUnminted && total === 0n) || isBurned,
  // ... rest unchanged
};
```

## File: convex/ledger/validation.ts (lines 7-64) — validateSupplyInvariant (duplicate)

Current code returns valid based on:
```typescript
valid: total === TOTAL_SUPPLY
```

**Problem:** After burn, total = 0 ≠ TOTAL_SUPPLY. Returns false.

**Fix:** Add `isBurned` condition:
```typescript
const positionSum = positions.reduce((sum, p) => sum + p.balance, 0n);
const total = treasuryBalance + positionSum;
const isBurned = treasuryBalance === 0n && positionSum === 0n;
return {
  valid: total === TOTAL_SUPPLY || isBurned,
  // ... rest unchanged
};
```

Note: This file already handles the "no treasury" case by returning `valid: false` early. The `isBurned` check only needs to handle the case where treasury exists with balance 0.

## File: convex/ledger/__tests__/ledger.test.ts — Add missing tests

**IMPORTANT**: Test IDs T-061 through T-064 are ALREADY USED by CORRECTION tests in this file (lines 742-850). Use T-076 and T-077 for new tests.

### Test T-076: Double-burn idempotency
Add to the "Mint & Burn" describe block (after T-060, around line 737).

Pattern: Mint → redeem all → burn with key "burn-m1" → burn again with SAME key "burn-m1" → should return same entry, no error.

```typescript
it("T-076: burnMortgage is idempotent on same idempotencyKey", async () => {
  const t = createTestHarness();
  await initCounter(t);
  const auth = asLedgerUser(t);

  // Mint and get all shares back to treasury
  await auth.mutation(api.ledger.mutations.mintMortgage, {
    mortgageId: "m1",
    effectiveDate: "2026-01-01",
    idempotencyKey: "mint-m1",
    source: SYS_SOURCE,
  });

  // First burn succeeds
  const firstBurn = await auth.mutation(api.ledger.mutations.burnMortgage, {
    mortgageId: "m1",
    effectiveDate: "2026-01-04",
    idempotencyKey: "burn-m1",
    source: SYS_SOURCE,
    reason: "Mortgage paid off",
  });

  // Second burn with SAME key returns same entry
  const secondBurn = await auth.mutation(api.ledger.mutations.burnMortgage, {
    mortgageId: "m1",
    effectiveDate: "2026-01-04",
    idempotencyKey: "burn-m1",
    source: SYS_SOURCE,
    reason: "Mortgage paid off",
  });

  expect(secondBurn._id).toBe(firstBurn._id);
});
```

### Test T-077: validateSupplyInvariant returns valid after burn
Add to the "Mint & Burn" describe block.

Pattern: Mint → burn → call both validateSupplyInvariant queries → assert valid === true and total === 0n.

```typescript
it("T-077: validateSupplyInvariant returns valid: true, total: 0 after burn", async () => {
  const t = createTestHarness();
  await initCounter(t);
  const auth = asLedgerUser(t);

  await auth.mutation(api.ledger.mutations.mintMortgage, {
    mortgageId: "m1",
    effectiveDate: "2026-01-01",
    idempotencyKey: "mint-m1",
    source: SYS_SOURCE,
  });

  await auth.mutation(api.ledger.mutations.burnMortgage, {
    mortgageId: "m1",
    effectiveDate: "2026-01-04",
    idempotencyKey: "burn-m1",
    source: SYS_SOURCE,
    reason: "Mortgage paid off",
  });

  // Check queries.ts version
  const invariantQ = await auth.query(
    api.ledger.queries.validateSupplyInvariant,
    { mortgageId: "m1" }
  );
  expect(invariantQ.valid).toBe(true);
  expect(invariantQ.total).toBe(0n);

  // Check validation.ts version
  const invariantV = await auth.query(
    api.ledger.validation.validateSupplyInvariant,
    { mortgageId: "m1" }
  );
  expect(invariantV.valid).toBe(true);
  expect(invariantV.total).toBe(0n);
});
```

## Existing Test Patterns to Follow
- Use `createTestHarness()` + `initCounter(t)` + `asLedgerUser(t)` for setup
- Use `SYS_SOURCE` for system-originated events
- Test IDs in describe block comments: `T-NNN: description`
- `api.ledger.mutations.burnMortgage` for public mutations
- `api.ledger.queries.validateSupplyInvariant` for the queries.ts version
- `api.ledger.validation.validateSupplyInvariant` for the validation.ts version
- Tests are inside describe blocks organized by feature

## Quality Gate Commands
After all changes:
1. `bun check` (auto-formats + lints)
2. `bun typecheck`
3. `bunx convex codegen`
4. `bun run test` (run full test suite)
