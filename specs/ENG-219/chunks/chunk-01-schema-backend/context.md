# Chunk 01 Context: Schema & Backend Changes

## Goal
Add audit metadata fields to `calculationDetails` and defensive assertions to the disbursement bridge, per ENG-219.

## T-001: validators.ts — Add fields to calculationDetailsValidator

**File:** `convex/dispersal/validators.ts`

Add two new optional fields at the end of the `calculationDetailsValidator` object:

```typescript
ownershipSnapshotDate: v.optional(v.string()),  // YYYY-MM-DD used for reroute filtering
reroutesAppliedCount: v.optional(v.number()),   // how many reroutes were applied
```

Fields MUST be `v.optional()` for backward compatibility with existing entries.

## T-002: types.ts — Add fields to CalculationDetails interface

**File:** `convex/dispersal/types.ts`

Add to the `CalculationDetails` interface (maintain alphabetical ordering of fields):

```typescript
ownershipSnapshotDate?: string;
reroutesAppliedCount?: number;
```

## T-003: createDispersalEntries.ts — Return reroute count + write new fields

**File:** `convex/dispersal/createDispersalEntries.ts`

### Step 1: Modify `applyDealReroutes` return type

Current signature (line 257):
```typescript
async function applyDealReroutes(
  ctx: MutationCtx,
  mortgageId: Id<"mortgages">,
  settledDate: string,
  positions: ActivePosition[]
) {
```

Change to return `Promise<number>` — the count of reroutes that were actually applied:

```typescript
async function applyDealReroutes(
  ctx: MutationCtx,
  mortgageId: Id<"mortgages">,
  settledDate: string,
  positions: ActivePosition[]
): Promise<number> {
```

Add a counter at the start of the function body:
```typescript
let appliedCount = 0;
```

Inside the for loop, after lines 307-308 (where units are adjusted), increment:
```typescript
fromPosition.units -= reroute.fractionalShare;
toPosition.units += reroute.fractionalShare;
appliedCount++;
```

Return the count at the end:
```typescript
return appliedCount;
```

### Step 2: Capture the return value in the handler

At line 416, the current call is:
```typescript
await applyDealReroutes(
  ctx,
  args.mortgageId,
  args.settledDate,
  activePositions
);
```

Change to capture the return value:
```typescript
const reroutesAppliedCount = await applyDealReroutes(
  ctx,
  args.mortgageId,
  args.settledDate,
  activePositions
);
```

### Step 3: Write new fields into calculationDetails

In the `ctx.db.insert("dispersalEntries", ...)` call (around line 469), add to `calculationDetails`:
```typescript
calculationDetails: {
  ...existingFields,
  ownershipSnapshotDate: args.settledDate,
  reroutesAppliedCount,
},
```

## T-004: disbursementBridge.ts — MISSING_CALCULATION_DETAILS assertion

**File:** `convex/dispersal/disbursementBridge.ts`

In `processSingleDisbursement`, after step 2 (re-read entry, line 218-234) and BEFORE step 3 (amount validation, line 237), insert:

```typescript
// 2b. Verify calculation details exist (ownership snapshot was recorded)
if (
  !entry.calculationDetails ||
  typeof entry.calculationDetails.settledAmount !== "number" ||
  entry.calculationDetails.settledAmount <= 0
) {
  throw new ConvexError({
    code: "MISSING_CALCULATION_DETAILS" as const,
    dispersalEntryId: args.dispersalEntryId,
    message: "Dispersal entry is missing valid calculation details",
  });
}
```

## T-005: disbursementBridge.ts — AMOUNT_EXCEEDS_DISTRIBUTABLE assertion

**File:** `convex/dispersal/disbursementBridge.ts`

After the MISSING_CALCULATION_DETAILS check (T-004) and before the existing amount validation (step 3), insert:

```typescript
// 2c. Verify amount does not exceed distributable amount
if (entry.amount > entry.calculationDetails.distributableAmount) {
  throw new ConvexError({
    code: "AMOUNT_EXCEEDS_DISTRIBUTABLE" as const,
    dispersalEntryId: args.dispersalEntryId,
    amount: entry.amount,
    distributableAmount: entry.calculationDetails.distributableAmount,
    message: "Entry amount exceeds the distributable amount from its calculation",
  });
}
```

## Constraints
- New `calculationDetails` fields MUST be `v.optional()` — existing entries without them must continue to work
- Do NOT change the bridge's core computation — it must still use `entry.amount` as-is
- Only one call site for `applyDealReroutes` exists (the handler) — low blast radius
- Run `bunx convex codegen` after schema changes

## Quality Gate
After completing all tasks:
```bash
bunx convex codegen && bun check && bun typecheck
```
