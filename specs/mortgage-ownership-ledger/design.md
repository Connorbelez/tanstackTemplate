# Mortgage Ownership Ledger — Design

> Derived from: https://www.notion.so/Mortgage-Ownership-Ledger-30ffc1b4402480bf9315e2e04fbeaab4

## Types & Interfaces

```typescript
// Entry types classifying business events
type EntryType =
  | "MORTGAGE_MINTED"      // WORLD → TREASURY (exactly 10,000 units)
  | "SHARES_ISSUED"        // TREASURY → POSITION
  | "SHARES_TRANSFERRED"   // POSITION(seller) → POSITION(buyer)
  | "SHARES_REDEEMED"      // POSITION → TREASURY
  | "MORTGAGE_BURNED"      // TREASURY → WORLD (exactly 10,000 units)
  | "CORRECTION";          // Any direction, admin-only, must reference causedBy

// Account types
type AccountType = "WORLD" | "TREASURY" | "POSITION";

// Event source provenance
interface EventSource {
  type: "user" | "system" | "webhook" | "cron";
  actor?: string;     // User ID
  channel?: string;   // 'marketplace' | 'admin' | 'system'
}

// Constants
const UNITS_PER_MORTGAGE = 10_000n;     // bigint — always this, no partial mints/burns
const MIN_POSITION_UNITS = 1_000n;      // 10% minimum — position is 0 or >= 1,000
```

## Database Schema

Tables use `ledger_` prefix. Core auth tables are unprefixed, demo tables use `demo_` — production feature tables use a domain prefix.

```typescript
// convex/schema.ts additions

ledger_accounts: defineTable({
  type: v.union(v.literal("WORLD"), v.literal("TREASURY"), v.literal("POSITION")),
  mortgageId: v.optional(v.string()),   // TREASURY and POSITION only; WORLD is global
  investorId: v.optional(v.string()),   // POSITION only
  cumulativeDebits: v.int64(),          // Total units ever debited TO this account (received)
  cumulativeCredits: v.int64(),         // Total units ever credited FROM this account (sent)
  // balance = cumulativeDebits - cumulativeCredits
  createdAt: v.float64(),
  metadata: v.optional(v.record(v.string(), v.any())),
})
  .index("by_mortgage", ["mortgageId"])
  .index("by_investor", ["investorId"])
  .index("by_mortgage_and_investor", ["mortgageId", "investorId"])
  .index("by_type_and_mortgage", ["type", "mortgageId"]),

ledger_journal_entries: defineTable({
  sequenceNumber: v.int64(),            // Monotonic, gap-free — total ordering guarantee
  entryType: v.union(
    v.literal("MORTGAGE_MINTED"),
    v.literal("SHARES_ISSUED"),
    v.literal("SHARES_TRANSFERRED"),
    v.literal("SHARES_REDEEMED"),
    v.literal("MORTGAGE_BURNED"),
    v.literal("CORRECTION"),
  ),
  mortgageId: v.string(),
  effectiveDate: v.string(),            // Business date YYYY-MM-DD
  timestamp: v.float64(),               // System clock ms — when entry was posted
  debitAccountId: v.id("ledger_accounts"),   // Account RECEIVING units
  creditAccountId: v.id("ledger_accounts"),  // Account GIVING units
  amount: v.int64(),                    // Always positive
  idempotencyKey: v.string(),           // Prevents double-posting on retry
  causedBy: v.optional(v.id("ledger_journal_entries")),  // Parent entry (required for CORRECTION)
  source: v.object({
    type: v.union(
      v.literal("user"), v.literal("system"),
      v.literal("webhook"), v.literal("cron"),
    ),
    actor: v.optional(v.string()),      // User ID
    channel: v.optional(v.string()),    // 'marketplace' | 'admin' | 'system'
  }),
  reason: v.optional(v.string()),       // Human-readable (required for CORRECTION)
  metadata: v.optional(v.record(v.string(), v.any())),
})
  .index("by_idempotency", ["idempotencyKey"])
  .index("by_mortgage_and_time", ["mortgageId", "timestamp"])
  .index("by_sequence", ["sequenceNumber"])
  .index("by_debit_account", ["debitAccountId", "timestamp"])
  .index("by_credit_account", ["creditAccountId", "timestamp"])
  .index("by_entry_type", ["entryType", "timestamp"]),

ledger_cursors: defineTable({
  consumerId: v.string(),               // e.g., "accrual_engine", "audit_export"
  lastProcessedSequence: v.int64(),
  lastProcessedAt: v.float64(),
})
  .index("by_consumer", ["consumerId"]),
```

### Account Lifecycle Rules

1. **WORLD**: Single global account, lazily created on first `mintMortgage`. Only account that can go negative. Balance = -(total units outstanding across all active mortgages).
2. **TREASURY**: Created by `mintMortgage`. One per mortgage. Never deleted. Starts at balance 10,000.
3. **POSITION**: Created on first purchase of a mortgage by an investor. **One per investor × mortgage pair. Always.** Never deleted — balance 0 is valid (historical record). Reused if investor buys back in.

### Balance Computation

```
balance = cumulativeDebits - cumulativeCredits
```

Both fields stored for auditability. Storing both means you can verify balance = debits - credits at any time, and audit total flow through any account.

## Architecture

### Data Flow

```
Orchestrator (marketplace/admin/system)
  │
  │  Tier 2 (convenience — primary API for orchestrators)
  ├──► issueShares(mortgageId, investorId, amount)    ──► finds/creates POSITION ──► postEntry(SHARES_ISSUED)
  ├──► transferShares(mortgageId, seller, buyer, amt)  ──► finds/creates buyer   ──► postEntry(SHARES_TRANSFERRED)
  ├──► redeemShares(mortgageId, investorId, amount)   ──► finds POSITION         ──► postEntry(SHARES_REDEEMED)
  │
  │  Tier 1 (strict primitives — account lifecycle + raw posting)
  ├──► mintMortgage(mortgageId)                       ──► creates TREASURY       ──► postEntry(MORTGAGE_MINTED)
  ├──► burnMortgage(mortgageId)                       ──► validates all clear    ──► postEntry(MORTGAGE_BURNED)
  └──► postEntry(debitAccountId, creditAccountId, ...) ──► throws if accounts missing
         │
         ▼
  ledger_journal_entries (append-only, immutable, monotonically sequenced)
  ledger_accounts (cumulative debits/credits updated atomically with each entry)
         │
         ▼
  Downstream consumers poll via ledger_cursors
  (accrual engine, payout system, audit export, dashboards)
```

### File Structure

```
convex/ledger/
  ├── constants.ts           # UNITS_PER_MORTGAGE, MIN_POSITION_UNITS
  ├── validators.ts          # Shared Convex validators for entry types, sources, args
  ├── internal.ts            # Internal helpers: getOrCreateWorldAccount, nextSequenceNumber,
  │                          #   computeBalance, getOrCreatePositionAccount, getTreasuryAccount
  ├── mutations.ts           # Tier 1: postEntry, mintMortgage, burnMortgage
  │                          # Tier 2: issueShares, transferShares, redeemShares
  ├── queries.ts             # getBalance, getPositions, getInvestorPositions,
  │                          #   getBalanceAt, getPositionsAt, getAccountHistory, getMortgageHistory
  ├── validation.ts          # validateSupplyInvariant
  └── cursors.ts             # getCursor, advanceCursor, resetCursor
```

### Two-Tier Write API

The ledger exposes two tiers of write mutations:

**Tier 1 — Strict primitives** (`postEntry`, `mintMortgage`, `burnMortgage`):
- `postEntry` takes account IDs directly. **Throws if either account doesn't exist.** Pure validation + write. No side-effects beyond the entry itself.
- `mintMortgage` creates the WORLD singleton (if needed) and TREASURY account, then calls postEntry internally.
- `burnMortgage` finds the TREASURY, validates all positions are zero, then calls postEntry internally.

**Tier 2 — Convenience mutations** (`issueShares`, `transferShares`, `redeemShares`):
- Accept `investorId` instead of account IDs.
- Handle POSITION account find-or-create (query `by_mortgage_and_investor`, create if missing) inside the ledger, within the same Convex transaction.
- Then delegate to `postEntry` for validation and write.
- These are the **primary API for orchestrators**. The vast majority of operations go through these.

This design means:
- `postEntry` stays pure — IDs in, validation, write, done. Easy to reason about and test.
- Account creation logic lives inside the ledger module (thoroughly tested), not scattered across orchestrators.
- Orchestrators never think about account lifecycle — they call `issueShares(mortgageId, investorId, amount, ...)` and the ledger handles everything.
- Advanced callers can still use `postEntry` directly if they already have account IDs.

All tiers share the same validation pipeline. There is no write path that bypasses `postEntry`'s validation.

### API Surface

#### Writes — Tier 1: Strict Primitives

| Function        | Args                                                                                                              | Returns                                      | Description                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `postEntry`     | entryType, mortgageId, debitAccountId, creditAccountId, amount, effectiveDate, idempotencyKey, source, reason?, causedBy?, metadata? | JournalEntry doc                             | Core write path — all validation, throws if accounts missing |
| `mintMortgage`  | mortgageId, effectiveDate, idempotencyKey, source, metadata?                                                      | { treasuryAccountId, journalEntry }          | Creates WORLD (if needed) + TREASURY, posts MORTGAGE_MINTED |
| `burnMortgage`  | mortgageId, effectiveDate, idempotencyKey, source, reason, metadata?                                              | JournalEntry doc                             | Burns 10,000 units back to WORLD               |

#### Writes — Tier 2: Convenience Mutations (primary orchestrator API)

| Function          | Args                                                                                                       | Returns                                      | Description                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `issueShares`     | mortgageId, investorId, amount, effectiveDate, idempotencyKey, source, metadata?                            | { positionAccountId, journalEntry }          | Finds/creates POSITION, then posts SHARES_ISSUED (TREASURY → POSITION) |
| `transferShares`  | mortgageId, sellerInvestorId, buyerInvestorId, amount, effectiveDate, idempotencyKey, source, metadata?     | { buyerAccountId, journalEntry }             | Finds/creates buyer POSITION, then posts SHARES_TRANSFERRED |
| `redeemShares`    | mortgageId, investorId, amount, effectiveDate, idempotencyKey, source, reason?, metadata?                   | JournalEntry doc                             | Finds POSITION (throws if missing), posts SHARES_REDEEMED |

#### Reads (Queries)

| Function              | Args                                       | Returns                                      | Description                                                |
| --------------------- | ------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------- |
| `getBalance`          | accountId                                  | bigint                                       | Current balance (cumulativeDebits - cumulativeCredits)     |
| `getPositions`        | mortgageId                                 | Array<{ investorId, accountId, balance }>    | All current non-zero positions for a mortgage              |
| `getInvestorPositions`| investorId                                 | Array<{ mortgageId, accountId, balance }>    | All current non-zero positions for an investor             |
| `getBalanceAt`        | accountId, asOf (timestamp)                | bigint                                       | Balance at a point in time via journal replay              |
| `getPositionsAt`      | mortgageId, asOf (timestamp)               | Array<{ investorId, balance }>               | All positions at a point in time via journal replay        |
| `getAccountHistory`   | accountId, opts? { from?, to?, limit? }    | JournalEntry[]                               | Journal entries touching an account (debit or credit side) |
| `getMortgageHistory`  | mortgageId, opts? { from?, to?, limit? }   | JournalEntry[]                               | All journal entries for a mortgage                         |

#### Validation (Queries)

| Function                  | Args        | Returns                                                               | Description                                |
| ------------------------- | ----------- | --------------------------------------------------------------------- | ------------------------------------------ |
| `validateSupplyInvariant` | mortgageId  | { valid, treasuryBalance, positions: Array<{investorId, balance}>, total } | Verify TREASURY + Σ POSITIONS = 10,000 |

#### Cursors (Mutations + Queries)

| Function        | Args                                          | Returns                        | Description                            |
| --------------- | --------------------------------------------- | ------------------------------ | -------------------------------------- |
| `getCursor`     | consumerId                                    | { lastProcessedSequence, ... } | Get consumer's current cursor position |
| `advanceCursor` | consumerId, lastProcessedSequence             | void                           | Advance cursor after processing batch  |
| `resetCursor`   | consumerId, toSequence? (default 0)           | void                           | Reset cursor (for backfill/rebuild)    |

## postEntry Validation Pipeline (Critical)

This is the most important section — it defines the ledger's correctness guarantees.

### Common Checks (all entry types)

1. `amount > 0` — no zero or negative transfers
2. Both `debitAccountId` and `creditAccountId` exist in `ledger_accounts`
3. `debitAccountId !== creditAccountId` — no self-transfers
4. **Idempotency**: Query `by_idempotency` index. If matching key exists, return existing entry without writing.
5. **Entry type → account type mapping**: The entry type constrains which account types are valid for debit/credit (see per-type rules below)

### Per-Type Validation

#### MORTGAGE_MINTED (WORLD → TREASURY)
- Debit account must be WORLD type
- Credit account must be TREASURY type
- Amount must be exactly `UNITS_PER_MORTGAGE` (10,000)
- No existing TREASURY for this mortgageId (prevents double-mint) — checked by `mintMortgage`
- TREASURY account created in same transaction by `mintMortgage`

#### SHARES_ISSUED (TREASURY → POSITION)
- Debit account must be TREASURY type with matching mortgageId
- Credit account must be POSITION type with matching mortgageId
- TREASURY balance >= amount (can't issue units that don't exist in treasury)
- Resulting POSITION balance >= `MIN_POSITION_UNITS` (1,000) — minimum fraction
- **postEntry throws if POSITION account doesn't exist** — use `issueShares` for auto-creation

#### SHARES_TRANSFERRED (POSITION(seller) → POSITION(buyer))
- Debit account (buyer) must be POSITION type
- Credit account (seller) must be POSITION type
- **Both accounts must have same mortgageId** — units can't leak between mortgages
- Seller balance >= amount (can't sell units you don't own)
- Resulting seller balance is **0 (full exit) or >= 1,000** (minimum fraction)
- Resulting buyer balance >= 1,000 (minimum fraction)
- **postEntry throws if buyer POSITION account doesn't exist** — use `transferShares` for auto-creation

#### SHARES_REDEEMED (POSITION → TREASURY)
- Debit account must be TREASURY type with matching mortgageId
- Credit account must be POSITION type with matching mortgageId
- POSITION balance >= amount
- Resulting POSITION balance is **0 (full exit) or >= 1,000** (minimum fraction)

#### MORTGAGE_BURNED (TREASURY → WORLD)
- Debit account must be WORLD type
- Credit account must be TREASURY type
- Amount must be exactly `UNITS_PER_MORTGAGE` (10,000)
- TREASURY balance must be exactly 10,000 (all positions redeemed first)
- No POSITION accounts for this mortgage have non-zero balance

#### CORRECTION
- `source.type` must be `"user"` (no system-generated corrections)
- `source.actor` must be present (admin identity)
- `causedBy` must reference an existing journal entry ID
- `reason` must be present (human-readable explanation)
- Same balance checks apply — a correction can't create an illegal state
- Account type constraints are relaxed (correction can move between any account types as needed)

### Post-Write Steps

After validation passes and the entry is written:
1. **Update debit account**: `cumulativeDebits += amount`
2. **Update credit account**: `cumulativeCredits += amount`
3. **Assign sequence number**: Monotonic, gap-free (see Sequence Number Strategy)

### Why Supply Invariant Is Mechanical

The supply invariant (TREASURY + Σ POSITIONS = 10,000) is **never explicitly checked at write time** because it's mechanically impossible to violate:
1. Mint creates exactly 10,000 in TREASURY. Only source of units.
2. Every subsequent entry moves units between accounts within the same mortgage. Balance checks prevent accounts from going negative.
3. Burn requires TREASURY = 10,000, meaning all units returned.
4. Units never cross mortgage boundaries (same-mortgage check on transfers).

`validateSupplyInvariant()` exists as a **read-time safety net** for reconciliation and auditing — if it ever returns `valid: false`, something is catastrophically wrong with the posting logic.

## Sequence Number Strategy

Monotonic, gap-free integers providing deterministic total ordering.

1. Query latest journal entry by `by_sequence` index, descending, take 1
2. New sequence = latest + 1 (or `1n` if no entries exist)
3. Convex OCC guarantees: if two concurrent transactions read the same latest entry, one retries against updated state — they get distinct sequence numbers

Even if two entries share the same millisecond timestamp, they have distinct sequence numbers and deterministic order. There is exactly one timeline of events.

## Idempotency Strategy

Before posting any entry, query `by_idempotency` index for the idempotencyKey. If a match exists, return the existing entry without writing. This makes retries safe — callers can retry the same operation and get the same result.

## Concurrency Model

Convex's optimistic concurrency control (OCC) handles all concurrency. No explicit locks needed.

**Example**: Two investors trying to buy the last 2,000 units simultaneously:
1. Transaction A reads TREASURY balance: 2,000. Passes validation. Writes entry.
2. Transaction B reads TREASURY balance: 2,000. Passes validation. Tries to write.
3. Convex detects Transaction B read stale data. Automatically retries B.
4. Transaction B retries, reads TREASURY balance: 0. Fails validation. Rejected.

The ledger doesn't implement any concurrency logic — the database handles it.

## Point-in-Time Reconstruction

Given any timestamp T, reconstruct exact ownership state:

```
Replay all journal entries where mortgageId = X AND timestamp <= T
ordered by sequenceNumber ascending.

For each entry:
  debitAccount.balance  += entry.amount   (gains units)
  creditAccount.balance -= entry.amount   (gives units)

Result: exact position of every investor at time T.
```

At FairLend's expected volume (hundreds of mortgages, dozens of entries per mortgage per year), full replay is fast. Snapshot optimization can be added later if needed.

## Implementation Decisions

### D-1: `ledger_` table prefix
Existing schema: unprefixed for core auth, `demo_` for demos. Production feature tables use domain prefix.

### D-2: `v.optional(v.record(v.string(), v.any()))` for metadata
Spec uses `Record<string, unknown>`. Convex `v.any()` is closest. Optional to avoid empty objects on every write. One of the rare justified uses of `v.any()` — metadata is opaque to the ledger.

### D-3: No frontend in initial implementation
Pure backend primitive. Admin UI for audit export can be added separately.

### D-4: Tests use convex-test, not Playwright
No frontend = no browser tests. Integration tests via `convex-test` exercise the full mutation→query flow, satisfying "e2e" for a backend-only system.

### D-5: Consumer cursors are infrastructure-only
Table + helpers included. No actual consumers implemented (F-2, F-3 out of scope). Pattern ready for downstream systems.

### D-6: entryType as union literal vs string
Spec shows `entryType: v.string()` but we use union of literals. Compile-time safety. Invalid entry types are caught by the type system, not runtime checks.

### D-7: postEntry debit/credit naming convention
The spec's convention: **debit = account receiving units, credit = account giving units.** This matches traditional double-entry accounting where debiting an asset account increases it. The debit account's `cumulativeDebits` increases; the credit account's `cumulativeCredits` increases.

### D-8: Two-tier write API for account lifecycle
`postEntry` is strict — takes account IDs, throws if missing. No side-effects beyond the entry.
Convenience mutations (`issueShares`, `transferShares`, `redeemShares`) accept `investorId`, handle POSITION account find-or-create inside the ledger module within the same Convex transaction, then delegate to `postEntry`. This keeps account creation logic in the ledger (thoroughly tested) while keeping `postEntry` pure. Orchestrators use Tier 2; advanced callers with pre-resolved account IDs can use Tier 1 directly.
