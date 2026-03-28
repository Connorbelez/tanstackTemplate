# Chunk 02 Context: Tests

## Goal
Add edge-case tests for temporal ownership snapshot correctness, bridge assertion tests, and snapshot metadata persistence tests.

## T-006: Edge-case test — reroute after dispersal, before disbursement

**File:** `convex/dispersal/__tests__/disbursementBridge.test.ts`

Add a new `describe` block: `"ENG-219: effective-date ownership snapshot"`

Test scenario: "reroute after dispersal calculation but before disbursement does NOT change amount"

Steps:
1. Use `seedFullScenario(t, { entryAmount: 45_000, payoutEligibleAfter: "2026-02-28" })` to create a pending dispersal entry
2. Record the original entry amount
3. Insert a deal reroute AFTER the dispersal was calculated (new `dealReroutes` record with `effectiveAfterDate: "2026-03-01"` — this is after the dispersal but before disbursement)
4. Run `processSingleDisbursement` via the bridge
5. Verify the transfer uses the ORIGINAL amount (45_000), not a recomputed amount

The deal reroute insertion requires:
```typescript
// Need to also insert a deal first
const dealId = await ctx.db.insert("deals", {
  status: "confirmed",
  mortgageId: seed.mortgageId,
  buyerId: "new-buyer-auth",
  sellerId: "lender-a-auth", // must match the lender's auth ID
  fractionalShare: 3000,
  closingDate: Date.now(),
  lawyerId: "test-lawyer",
  lawyerType: "platform_lawyer",
  createdAt: Date.now(),
  createdBy: "test-admin",
});
await ctx.db.insert("dealReroutes", {
  dealId,
  mortgageId: seed.mortgageId,
  fromOwnerId: "lender-a-auth", // same as original lender
  toOwnerId: "new-buyer-auth",
  fractionalShare: 3000,
  effectiveAfterDate: "2026-03-01", // after settlement, before disbursement
  createdAt: Date.now(),
});
```

**IMPORTANT:** The `seedFullScenario` function uses `lender-a-${Date.now()}` as auth IDs (unique per seed call). Check the seed to get the correct auth ID, OR just insert the reroute using different auth IDs — the key point is that a reroute EXISTS but the bridge still uses the original entry.amount. The bridge reads `entry.amount` directly and never recomputes, so the reroute doesn't matter.

Actually, looking at the bridge code more carefully: `processSingleDisbursement` reads `entry.amount` directly from the database at line 237. It never calls `applyDealReroutes` or recomputes ownership. So the test is simply:
1. Seed a dispersal entry with known amount
2. Insert a deal reroute (proves one exists)
3. Run the bridge
4. Assert `transfer.amount === entry.amount`

## T-007: Bridge assertion tests

**File:** `convex/dispersal/__tests__/disbursementBridge.test.ts`

Add inside the `"ENG-219: effective-date ownership snapshot"` describe block.

### Test 1: "rejects entry with missing calculationDetails"
1. Seed a normal scenario
2. Patch the entry to remove calculationDetails: `await ctx.db.patch(seed.dispersalEntryId, { calculationDetails: undefined as any })`
   - NOTE: The schema may not allow `undefined` for calculationDetails. If so, patch with an object that has `settledAmount: 0` or `settledAmount: -1` to trigger the `settledAmount <= 0` check.
3. Call `processSingleDisbursement`
4. Expect `MISSING_CALCULATION_DETAILS` error

### Test 2: "rejects entry whose amount exceeds distributableAmount"
1. Seed with `entryAmount: 100_000`
2. Patch entry: `amount: 200_000` (exceeds distributableAmount which is 75_000 from seed)
3. Also patch LENDER_PAYABLE credit up to match (so the balance gate doesn't fail first)
4. Call `processSingleDisbursement`
5. Expect `AMOUNT_EXCEEDS_DISTRIBUTABLE` error

Use the existing `getConvexErrorCode` helper already defined in the test file.

## T-008: Snapshot metadata tests

**File:** `convex/dispersal/__tests__/createDispersalEntries.test.ts`

Add a new describe block inside the existing `describe("createDispersalEntries", ...)`: `"ENG-219: ownership snapshot metadata"`

### Test 1: "records ownershipSnapshotDate in calculationDetails"
1. Use existing `seedDispersalScenario(t, { positionUnits: [6000, 4000], settledDate: "2026-03-15" })`
2. Run `runCreateDispersal(t, { settledDate: "2026-03-15", ... })`
3. Read persisted entries from the database
4. Assert each entry's `calculationDetails.ownershipSnapshotDate === "2026-03-15"`
5. Assert each entry's `calculationDetails.reroutesAppliedCount === 0` (no reroutes in this scenario)

### Test 2: "records reroutesAppliedCount when reroutes are applied"
1. Use `seedDispersalScenario(t, { positionUnits: [7000, 3000], includeReroute: true, settledDate: "2026-03-15" })`
2. Run dispersal creation
3. Read entries
4. Assert `calculationDetails.reroutesAppliedCount === 1`
5. Assert `calculationDetails.ownershipSnapshotDate === "2026-03-15"`

**Existing test patterns to follow:**
- Uses `convexTest(schema, modules)` with component registration
- Uses `createDispersalEntriesMutation._handler(ctx, args)` for direct handler calls
- Uses `t.run(async (ctx) => ...)` for database reads

## T-009: Quality Gate

Run these commands in sequence:
```bash
bunx convex codegen
bun check
bun typecheck
bun run test -- --run convex/dispersal/__tests__/
```

All must pass. If lint/typecheck fails, fix the issues first, then re-run.

## Test Helpers Available
- `createHarness()` — creates convex-test harness with mock providers enabled
- `seedFullScenario(t, options)` — seeds broker, borrower, lender, mortgage, obligation, ledger account, LENDER_PAYABLE, dispersal entry
- `getConvexErrorCode(e)` — extracts error code from ConvexError
- `seedDispersalScenario(t, options)` — seeds for createDispersalEntries tests (includes reroute option)
- `runCreateDispersal(t, args)` — runs createDispersalEntries handler directly
