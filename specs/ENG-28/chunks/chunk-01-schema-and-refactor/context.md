# Chunk Context: Schema & Refactor

Source: Linear ENG-28, Notion implementation plan + SPEC 1.3.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

### What This Issue Does
Implement shared account helper functions in `convex/ledger/accounts.ts` used by convenience mutations and postEntry. This is primarily a **refactor + gap-fill**, not greenfield — most helpers already exist in `convex/ledger/internal.ts` with different names/signatures.

### Drift Report

| Spec Requirement | Current Code | File | Status | Drift |
|---|---|---|---|---|
| `getWorldAccount(ctx)` | Combined inside `getOrCreateWorldAccount(ctx)` | `internal.ts:16` | Partial | Needs split: read-only version that throws |
| `initializeWorldAccount(ctx)` | Combined inside `getOrCreateWorldAccount(ctx)` | `internal.ts:16` | Partial | Keep existing as `initializeWorldAccount`, add separate `getWorldAccount` |
| `getTreasuryAccount(ctx, mortgageId)` → returns null | `getTreasuryAccount(ctx, mortgageId)` → throws | `internal.ts:41` | Behavior mismatch | Change to return `null` instead of throwing. Update downstream call sites that catch/expect the throw |
| `getOrCreatePositionAccount(ctx, mortgageId, investorId)` | `getOrCreatePositionAccount(ctx, mortgageId, lenderId)` | `internal.ts:88` | Exists | Parameter named `lenderId` not `investorId` — acceptable, matches domain model |
| `getPostedBalance(account)` | `computeBalance(account)` | `internal.ts:6` | Name mismatch | Rename `computeBalance` → `getPostedBalance` across codebase |
| `getAvailableBalance(account)` | Not implemented | — | Missing | Requires `pendingCredits` field on `ledger_accounts` |
| File: `convex/ledger/accounts.ts` | Helpers live in `convex/ledger/internal.ts` | — | Path mismatch | Extract to `accounts.ts` per spec |

### Decision Point: `getAvailableBalance` and `pendingCredits`
Implement `getAvailableBalance` with the formula, but add the `pendingCredits` field to the schema as `v.optional(v.int64())` defaulting to `0n` when absent. This satisfies the acceptance criteria while keeping the schema change minimal and backward-compatible. ENG-34 will populate the field when reservations are implemented.

## Schema / Data Model

Current `ledger_accounts` table in `convex/schema.ts` (line ~837):
```typescript
ledger_accounts: defineTable({
    type: v.union(
        v.literal("WORLD"),
        v.literal("TREASURY"),
        v.literal("POSITION")
    ),
    mortgageId: v.optional(v.string()),
    lenderId: v.optional(v.string()),
    cumulativeDebits: v.int64(),
    cumulativeCredits: v.int64(),
    createdAt: v.float64(),
    metadata: v.optional(v.record(v.string(), v.any())),
})
    .index("by_mortgage", ["mortgageId"])
    .index("by_lender", ["lenderId"])
    .index("by_mortgage_and_lender", ["mortgageId", "lenderId"])
    .index("by_type_and_mortgage", ["type", "mortgageId"]),
```

Add after `createdAt`:
```typescript
pendingCredits: v.optional(v.int64()),
```

## Types & Interfaces

### Key Type Signatures (contracts for downstream issues)
```typescript
// Balance functions — pure, synchronous
getPostedBalance(account: Pick<Doc<"ledger_accounts">, "cumulativeDebits" | "cumulativeCredits">): bigint
getAvailableBalance(account: Pick<Doc<"ledger_accounts">, "cumulativeDebits" | "cumulativeCredits" | "pendingCredits">): bigint

// Account lookups — async, require Convex context
getWorldAccount(ctx: QueryCtx): Promise<Doc<"ledger_accounts">>
initializeWorldAccount(ctx: MutationCtx): Promise<Doc<"ledger_accounts">>
getTreasuryAccount(ctx: QueryCtx, mortgageId: string): Promise<Doc<"ledger_accounts"> | null>
getOrCreatePositionAccount(ctx: MutationCtx, mortgageId: string, lenderId: string): Promise<Doc<"ledger_accounts">>
```

### accountOwnership.ts
```typescript
export interface LegacyOwnedLedgerAccount {
    _id?: string;
    investorId?: string;
    lenderId?: string;
}
export function getAccountLenderId(account: LegacyOwnedLedgerAccount): string | undefined {
    return account.lenderId ?? account.investorId;
}
```

## Implementation Code Sketches

### convex/ledger/accounts.ts (full file)
```typescript
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAccountLenderId } from "./accountOwnership";

// ── Balance Calculations ──────────────────────────────────────

/** Compute posted balance: debits received minus credits given */
export function getPostedBalance(
  account: Pick<Doc<"ledger_accounts">, "cumulativeDebits" | "cumulativeCredits">
): bigint {
  return account.cumulativeDebits - account.cumulativeCredits;
}

/** Compute available balance: posted balance minus pending outflows */
export function getAvailableBalance(
  account: Pick<Doc<"ledger_accounts">, "cumulativeDebits" | "cumulativeCredits" | "pendingCredits">
): bigint {
  const posted = account.cumulativeDebits - account.cumulativeCredits;
  const pending = account.pendingCredits ?? 0n;
  return posted - pending;
}

// ── WORLD Account ─────────────────────────────────────────────

/** Returns the singleton WORLD account. Throws if not found. */
export async function getWorldAccount(ctx: QueryCtx) {
  const world = await ctx.db
    .query("ledger_accounts")
    .withIndex("by_type_and_mortgage", (q) =>
      q.eq("type", "WORLD").eq("mortgageId", undefined)
    )
    .first();
  if (!world) {
    throw new Error("WORLD account not found. Call initializeWorldAccount first.");
  }
  return world;
}

/** Creates the WORLD singleton idempotently. Returns existing if already created. */
export async function initializeWorldAccount(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("ledger_accounts")
    .withIndex("by_type_and_mortgage", (q) =>
      q.eq("type", "WORLD").eq("mortgageId", undefined)
    )
    .first();
  if (existing) return existing;

  const id = await ctx.db.insert("ledger_accounts", {
    type: "WORLD",
    cumulativeDebits: 0n,
    cumulativeCredits: 0n,
    createdAt: Date.now(),
  });
  const account = await ctx.db.get(id);
  if (!account) throw new Error("Failed to create WORLD account");
  return account;
}

// ── TREASURY Account ──────────────────────────────────────────

/** Returns TREASURY for a mortgage, or null if not found. */
export async function getTreasuryAccount(
  ctx: QueryCtx,
  mortgageId: string
): Promise<Doc<"ledger_accounts"> | null> {
  return ctx.db
    .query("ledger_accounts")
    .withIndex("by_type_and_mortgage", (q) =>
      q.eq("type", "TREASURY").eq("mortgageId", mortgageId)
    )
    .first();
}

// ── POSITION Account ──────────────────────────────────────────

/** Find existing POSITION account. Throws if not found. */
export async function getPositionAccount(
  ctx: QueryCtx,
  mortgageId: string,
  lenderId: string
) {
  // (same implementation as current internal.ts — uses by_mortgage_and_lender index + fallback)
}

/** Find or create POSITION account for a lender×mortgage pair. */
export async function getOrCreatePositionAccount(
  ctx: MutationCtx,
  mortgageId: string,
  lenderId: string
) {
  // (same implementation as current internal.ts:88-127)
}
```

### convex/ledger/internal.ts (after refactor)
```typescript
import type { QueryCtx } from "../_generated/server";

// Re-export account helpers from canonical location
export {
  getPostedBalance,
  getAvailableBalance,
  getWorldAccount,
  initializeWorldAccount,
  getTreasuryAccount,
  getOrCreatePositionAccount,
  getPositionAccount,
} from "./accounts";

// Keep sequence number logic here (it's journal-specific, not account-specific)
export async function nextSequenceNumber(ctx: QueryCtx): Promise<bigint> {
  const latest = await ctx.db
    .query("ledger_journal_entries")
    .withIndex("by_sequence")
    .order("desc")
    .first();
  return latest ? latest.sequenceNumber + 1n : 1n;
}
```

### mutations.ts changes
Key changes needed:
1. Import `initializeWorldAccount` instead of `getOrCreateWorldAccount`
2. Import `getPostedBalance` instead of `computeBalance`
3. All `getTreasuryAccount` calls now return null — add null-checks with Error throws at call sites:
```typescript
const treasury = await getTreasuryAccount(ctx, args.mortgageId);
if (!treasury) {
  throw new Error(`No TREASURY account for mortgage ${args.mortgageId}. Mint first.`);
}
```

### queries.ts changes
Replace all `computeBalance(...)` calls with `getPostedBalance(...)`, update import.

### validation.ts changes
Replace `computeBalance` import and usage with `getPostedBalance`.

## Integration Points

### Downstream Issues That Import These Helpers
- **ENG-29** (mintAndIssue): `initializeWorldAccount`, `getOrCreatePositionAccount`, `getTreasuryAccount` → must handle null
- **ENG-30** (issueShares, transferShares, redeemShares): `getTreasuryAccount` → null check, `getOrCreatePositionAccount`, `getPositionAccount`
- **ENG-31** (burnMortgage): `initializeWorldAccount`, `getTreasuryAccount` → null check, `getPostedBalance`
- **ENG-32** (postCorrection): Account lookup helpers, `getPostedBalance`
- **ENG-34** (reserveShares): `getAvailableBalance` (the key consumer), will write `pendingCredits`
- **ENG-37** (read API): `getPostedBalance` for `getBalance` query

## Constraints & Rules
- Never use `any` as a type (CLAUDE.md)
- Run `bun check` BEFORE fixing lint errors — it auto-fixes (CLAUDE.md)
- Keep `lenderId` as the canonical field name (codebase convention)
- Per CLAUDE.md: "avoid backwards-compatibility hacks" — clean rename `computeBalance` → `getPostedBalance` everywhere, no deprecated aliases
- All helpers are pure internal functions — NOT exposed as Convex mutations/queries
- Account creation is always atomic within the calling mutation
- POSITION accounts are never deleted (historical record preserved)

## File Structure
- `convex/ledger/accounts.ts` — NEW, all account helpers
- `convex/ledger/internal.ts` — MODIFIED, keep `nextSequenceNumber` + re-exports
- `convex/ledger/mutations.ts` — MODIFIED, import updates + null-checks
- `convex/ledger/queries.ts` — MODIFIED, rename computeBalance
- `convex/ledger/validation.ts` — MODIFIED, rename computeBalance
- `convex/schema.ts` — MODIFIED, add pendingCredits field
