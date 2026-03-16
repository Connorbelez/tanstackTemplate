# Chunk 01 Context: Schema, Validators & Constants

## What This Chunk Does
Foundation changes — add 3 reservation entry types, reservation ID field, and pending balance fields to the schema. Update validators and constants to match.

## Current Schema State

### ledger_journal_entries (convex/schema.ts ~line 855)
Currently has 6 entry types:
```typescript
entryType: v.union(
  v.literal("MORTGAGE_MINTED"),
  v.literal("SHARES_ISSUED"),
  v.literal("SHARES_TRANSFERRED"),
  v.literal("SHARES_REDEEMED"),
  v.literal("MORTGAGE_BURNED"),
  v.literal("CORRECTION")
),
```
No `reservationId` field exists.

### ledger_accounts (convex/schema.ts ~line 837)
Currently has:
```typescript
ledger_accounts: defineTable({
  type: v.union(v.literal("WORLD"), v.literal("TREASURY"), v.literal("POSITION")),
  mortgageId: v.optional(v.string()),
  lenderId: v.optional(v.string()),
  cumulativeDebits: v.int64(),
  cumulativeCredits: v.int64(),
  createdAt: v.float64(),
  metadata: v.optional(v.record(v.string(), v.any())),
})
```
No `pendingDebits` or `pendingCredits` fields exist.

### Current validators.ts
```typescript
export const entryTypeValidator = v.union(
  v.literal("MORTGAGE_MINTED"),
  v.literal("SHARES_ISSUED"),
  v.literal("SHARES_TRANSFERRED"),
  v.literal("SHARES_REDEEMED"),
  v.literal("MORTGAGE_BURNED"),
  v.literal("CORRECTION")
);

export const postEntryArgsValidator = {
  entryType: entryTypeValidator,
  mortgageId: v.string(),
  debitAccountId: v.id("ledger_accounts"),
  creditAccountId: v.id("ledger_accounts"),
  amount: v.int64(),
  effectiveDate: v.string(),
  idempotencyKey: v.string(),
  source: eventSourceValidator,
  causedBy: v.optional(v.id("ledger_journal_entries")),
  reason: v.optional(v.string()),
  metadata: v.optional(v.record(v.string(), v.any())),
};
```

### Current constants.ts
```typescript
export const UNITS_PER_MORTGAGE = 10_000n;
export const MIN_POSITION_UNITS = 1_000n;
```

## Target State

### Schema changes:
1. Add `v.literal("SHARES_RESERVED")`, `v.literal("SHARES_COMMITTED")`, `v.literal("SHARES_VOIDED")` to `ledger_journal_entries.entryType` union (before CORRECTION)
2. Add `reservationId: v.optional(v.string())` to `ledger_journal_entries` (after `reason`)
3. Add `pendingDebits: v.optional(v.int64())` and `pendingCredits: v.optional(v.int64())` to `ledger_accounts` (after `cumulativeCredits`)

### Validators changes:
1. Add 3 literals to `entryTypeValidator`
2. Add `reservationId: v.optional(v.string())` to `postEntryArgsValidator`

### Constants changes:
Add:
```typescript
/** Entry types that create audit-trail-only journal entries (no cumulative balance updates). */
export const AUDIT_ONLY_ENTRY_TYPES = new Set([
  "SHARES_RESERVED",
  "SHARES_VOIDED",
]) as ReadonlySet<string>;
```

## Constraints
- SHARES_COMMITTED is NOT in AUDIT_ONLY — it updates cumulatives normally
- The pending fields are optional (v.optional) so existing data isn't broken
- Run `bunx convex codegen` after schema changes to regenerate types
- Run `bun check && bun typecheck` to verify
