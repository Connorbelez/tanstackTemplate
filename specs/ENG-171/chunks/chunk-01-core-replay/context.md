# Chunk 01 Context: Core Replay Module

## Goal
Build a read-only integrity checker that replays journal entries in canonical `sequenceNumber` order, derives expected account balances from the replay, and compares them against stored `cumulativeDebits`/`cumulativeCredits` on `cash_ledger_accounts`.

## File to Create
`convex/payments/cashLedger/replayIntegrity.ts`

## Key Design Decisions
1. **Option B (full replay always) is the recommended approach.** The `mode: "incremental"` flag controls the *starting sequence* (from cursor vs from 0), not a snapshot+delta approach. Start simple.
2. **Pure `QueryCtx` function** — read-only, no mutations. Only the cursor is updated via a separate mutation (chunk-02).
3. **BigInt throughout** for precision. Serialize to string in result types for Convex JSON compatibility.
4. **Scope filtering is post-load** — the primary access pattern is index scan by `sequenceNumber`. Filtering by account/mortgage happens in-memory after loading.
5. **Missing sequence detection only in full mode** — incremental can't detect gaps before the cursor.
6. **Deterministic**: Two independent replay processes must produce identical results (REQ-243, Tech Design §3.2).

## Types to Export

```typescript
export interface ReplayScope {
  mode: "full" | "incremental";
  accountId?: Id<"cash_ledger_accounts">;
  mortgageId?: Id<"mortgages">;
}

export interface ReplayMismatch {
  accountId: Id<"cash_ledger_accounts">;
  family: string;
  expectedDebits: string;   // BigInt serialized
  expectedCredits: string;
  storedDebits: string;
  storedCredits: string;
  firstDivergenceSequence: string;
  lastEntrySequence: string;
}

export interface ReplayResult {
  passed: boolean;
  mode: "full" | "incremental";
  entriesReplayed: number;
  accountsChecked: number;
  mismatches: ReplayMismatch[];
  missingSequences: string[];
  fromSequence: string;
  toSequence: string;
  durationMs: number;
}
```

## Upstream Dependencies (all exist and are stable)

### `getCashAccountBalance()` — `accounts.ts:23`
```typescript
export function getCashAccountBalance(
  account: Pick<Doc<"cash_ledger_accounts">, "family" | "cumulativeDebits" | "cumulativeCredits">
): bigint {
  return isCreditNormalFamily(account.family)
    ? account.cumulativeCredits - account.cumulativeDebits
    : account.cumulativeDebits - account.cumulativeCredits;
}
```

### `isCreditNormalFamily()` — `accounts.ts:19`
```typescript
export function isCreditNormalFamily(family: CashAccountFamily) {
  return CREDIT_NORMAL_FAMILIES.has(family);
}
```
Credit-normal families: `CASH_CLEARING`, `LENDER_PAYABLE`, `SERVICING_REVENUE`, `UNAPPLIED_CASH`

### `createAccountCache()` — `accounts.ts:196`
Per-query account cache to avoid redundant `db.get()` calls.

### `cash_ledger_cursors` table — `schema.ts`
```typescript
cash_ledger_cursors: defineTable({
  name: v.string(),
  lastProcessedSequence: v.int64(),
  lastProcessedAt: v.number(),
}).index("by_name", ["name"])
```

### `by_sequence` index on journal entries — `schema.ts`
```typescript
.index("by_sequence", ["sequenceNumber"])
```
This allows efficient range scans: `q.gt("sequenceNumber", fromSequence)`.

### Journal entry schema fields used by replay
- `sequenceNumber: v.int64()` — canonical replay order
- `debitAccountId: v.id("cash_ledger_accounts")`
- `creditAccountId: v.id("cash_ledger_accounts")`
- `amount: v.int64()` — cents, always positive
- `mortgageId: v.optional(v.id("mortgages"))` — for mortgage scope filtering

### Sequence counter — `sequenceCounter.ts`
Starts at 0, increments to 1 for the first entry. So `fromSequence = 0n` with `q.gt()` will load all entries from sequence 1 onward.

## Algorithm

1. **Determine starting sequence:**
   - `full` mode: `fromSequence = 0n`
   - `incremental` mode: Load cursor `replay_integrity` from `cash_ledger_cursors`. If exists, use `lastProcessedSequence`. Otherwise fall back to `0n`.

2. **Load entries in sequence order:**
   ```typescript
   ctx.db.query("cash_ledger_journal_entries")
     .withIndex("by_sequence", q => q.gt("sequenceNumber", fromSequence))
     .collect()
   ```

3. **Filter by scope** (if accountId or mortgageId specified).

4. **Replay — accumulate per-account debits/credits:**
   For each entry:
   - Check for sequence gaps (full mode only)
   - Add `entry.amount` to `expectedDebits` for `entry.debitAccountId`
   - Add `entry.amount` to `expectedCredits` for `entry.creditAccountId`

5. **Compare against stored state:**
   For each account in the expected map:
   - Load account via `ctx.db.get(accountId)`
   - For full mode: compare `expectedDebits === account.cumulativeDebits` and `expectedCredits === account.cumulativeCredits`
   - For incremental mode: we can't directly compare (we only have the delta). Log a warning and skip comparison for now. The implementation plan recommends starting with full replay always.

6. **Return `ReplayResult`.**

## Constraints
- **Read-only**: MUST NOT modify any journal entries or account balances.
- **Deterministic**: Use `sequenceNumber` for ordering, NOT `timestamp`.
- **BigInt precision**: All balance computations use `bigint`.
- **No `any` types** (per CLAUDE.md).
