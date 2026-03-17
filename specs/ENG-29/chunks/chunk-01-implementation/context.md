# Chunk 01 Context: mintAndIssue Implementation

## Linear Issue: ENG-29

### Description
Implement `mintAndIssue` as a convenience mutation in `convex/ledger/mutations.ts`. This is the atomic single-mutation entry point for creating a new mortgage in the ledger and distributing all 10,000 units to initial investors.

### Acceptance Criteria (verbatim)
- Takes mortgageId, allocations array [{investorId, amount}], effectiveDate, idempotencyKey, source, optional metadata
- Allocations MUST sum to exactly 10,000 — rejected otherwise with zero side effects
- Each allocation MUST be >= 1,000 (minimum 10% fraction)
- No existing TREASURY for this mortgageId (prevents double-mint)
- Atomic: creates WORLD account (if needed), creates TREASURY, posts MORTGAGE_MINTED (WORLD → TREASURY 10,000), creates POSITIONs, posts SHARES_ISSUED for each allocation — all in one Convex mutation
- Result: TREASURY balance = 0 (all units immediately allocated to positions)
- Returns treasuryAccountId, mintEntry, issueEntries[]
- If ANY validation fails, entire mutation rolls back (no TREASURY, no accounts, no entries)
- Auth: ~~adminMutation~~ **USE `ledgerMutation`** (user override — matches other ledger mutations)
- Tests: happy path, allocations != 10,000, allocation < 1,000, double-mint, rollback verification

### Technical Notes
- Called by Project 2 seed mutations when seeding mortgage data.
- Supply invariant verified after all entries posted as belt-and-suspenders check.

---

## Key Decisions (from plan + user feedback)

1. **Auth chain: `ledgerMutation`** (NOT `adminMutation`). User explicitly overrode the issue description.
2. **File location:** Add to existing `convex/ledger/mutations.ts` (same pattern as all other mutations). Do NOT create a subdirectory.
3. **Param naming:** Use `lenderId` (not `investorId`) in allocations to match existing codebase convention.
4. **Idempotency key derivation:** Each SHARES_ISSUED entry gets `{parentKey}:issue:{lenderId}` as its idempotency key.
5. **Belt-and-suspenders:** Inline supply invariant check at end of mutation — read back TREASURY balance, assert === 0.

---

## Dependency Contracts

### postEntry (ENG-27 — code exists at `convex/ledger/postEntry.ts`)

```typescript
export interface PostEntryInput {
  amount: number;
  causedBy?: Id<"ledger_journal_entries">;
  creditAccountId: Id<"ledger_accounts">;
  debitAccountId: Id<"ledger_accounts">;
  effectiveDate: string;
  entryType: EntryType;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  mortgageId: string;
  reason?: string;
  reservationId?: Id<"ledger_reservations">;
  source: EventSource;
}

export async function postEntry(
  ctx: MutationCtx,
  args: PostEntryInput
): Promise<Doc<"ledger_journal_entries">>
```

Convention (D-7): debitAccountId = account RECEIVING units, creditAccountId = account GIVING units.

### Account Helpers (ENG-28 — Done, `convex/ledger/accounts.ts`)

```typescript
export async function initializeWorldAccount(ctx: MutationCtx): Promise<Doc<"ledger_accounts">>
export async function getTreasuryAccount(ctx: QueryCtx, mortgageId: string): Promise<Doc<"ledger_accounts"> | null>
export async function getOrCreatePositionAccount(ctx: MutationCtx, mortgageId: string, lenderId: string): Promise<Doc<"ledger_accounts">>
export function getPostedBalance(account: Pick<Doc<"ledger_accounts">, "cumulativeDebits" | "cumulativeCredits">): bigint
```

### Constants (`convex/ledger/constants.ts`)

```typescript
export const TOTAL_SUPPLY = 10_000n;
export const MIN_FRACTION = 1_000n;
```

### Fluent Middleware (`convex/fluent.ts`)

```typescript
export const ledgerMutation = authedMutation.use(requirePermission("ledger:correct"));
```

### Existing Validators Pattern (`convex/ledger/validators.ts`)

```typescript
export const eventSourceValidator = v.object({
  type: literalUnion(EVENT_SOURCE_TYPES),
  actor: v.optional(v.string()),
  channel: v.optional(v.string()),
});

// Example: existing issueSharesArgsValidator
export const issueSharesArgsValidator = {
  mortgageId: v.string(),
  lenderId: v.string(),
  amount: v.number(),
  effectiveDate: v.string(),
  idempotencyKey: v.string(),
  source: eventSourceValidator,
  metadata: v.optional(v.any()),
};
```

---

## Schema Context

### ledger_accounts table
```typescript
ledger_accounts: defineTable({
  type: v.union(v.literal("WORLD"), v.literal("TREASURY"), v.literal("POSITION")),
  mortgageId: v.optional(v.string()),
  lenderId: v.optional(v.string()),
  cumulativeDebits: v.int64(),
  cumulativeCredits: v.int64(),
  pendingDebits: v.int64(),
  pendingCredits: v.int64(),
  createdAt: v.number(),
  metadata: v.optional(v.any()),
})
  .index("by_mortgage", ["mortgageId"])
  .index("by_lender", ["lenderId"])
  .index("by_mortgage_and_lender", ["mortgageId", "lenderId"])
  .index("by_type_and_mortgage", ["type", "mortgageId"]),
```

### ledger_journal_entries table
```typescript
ledger_journal_entries: defineTable({
  sequenceNumber: v.int64(),
  entryType: v.union(
    v.literal("MORTGAGE_MINTED"), v.literal("SHARES_ISSUED"),
    v.literal("SHARES_TRANSFERRED"), v.literal("SHARES_REDEEMED"),
    v.literal("MORTGAGE_BURNED"), v.literal("SHARES_RESERVED"),
    v.literal("SHARES_COMMITTED"), v.literal("SHARES_VOIDED"),
    v.literal("CORRECTION")
  ),
  reservationId: v.optional(v.id("ledger_reservations")),
  mortgageId: v.string(),
  effectiveDate: v.string(),
  timestamp: v.number(),
  debitAccountId: v.id("ledger_accounts"),
  creditAccountId: v.id("ledger_accounts"),
  amount: v.number(),
  idempotencyKey: v.string(),
  causedBy: v.optional(v.id("ledger_journal_entries")),
  source: v.object({
    type: v.union(v.literal("user"), v.literal("system"), v.literal("webhook"), v.literal("cron")),
    actor: v.optional(v.string()),
    channel: v.optional(v.string()),
  }),
  reason: v.optional(v.string()),
  metadata: v.optional(v.any()),
})
  .index("by_idempotency", ["idempotencyKey"])
  .index("by_mortgage_and_time", ["mortgageId", "timestamp"])
  .index("by_sequence", ["sequenceNumber"])
  .index("by_debit_account", ["debitAccountId", "timestamp"])
  .index("by_credit_account", ["creditAccountId", "timestamp"])
  .index("by_entry_type", ["entryType", "timestamp"]),
```

---

## Existing Mutation Pattern (mintMortgage — follow this style)

```typescript
export const mintMortgage = ledgerMutation
  .input(mintMortgageArgsValidator)
  .handler(async (ctx, args) => {
    // Idempotency check
    const existingEntry = await ctx.db
      .query("ledger_journal_entries")
      .withIndex("by_idempotency", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey)
      )
      .first();
    if (existingEntry) {
      const treasury = await ctx.db
        .query("ledger_accounts")
        .withIndex("by_type_and_mortgage", (q) =>
          q.eq("type", "TREASURY").eq("mortgageId", args.mortgageId)
        )
        .first();
      if (!treasury) {
        throw new ConvexError({
          code: "IDEMPOTENT_REPLAY_FAILED" as const,
          message: `Idempotent mint replay: TREASURY for ${args.mortgageId} not found`,
        });
      }
      return { treasuryAccountId: treasury._id, journalEntry: existingEntry };
    }

    // Prevent double-mint
    const existingTreasury = await ctx.db
      .query("ledger_accounts")
      .withIndex("by_type_and_mortgage", (q) =>
        q.eq("type", "TREASURY").eq("mortgageId", args.mortgageId)
      )
      .first();
    if (existingTreasury) {
      throw new ConvexError({
        code: "ALREADY_MINTED" as const,
        message: `Mortgage ${args.mortgageId} already minted (TREASURY exists)`,
      });
    }

    const worldAccount = await initializeWorldAccount(ctx);

    const treasuryId = await ctx.db.insert("ledger_accounts", {
      type: "TREASURY",
      mortgageId: args.mortgageId,
      cumulativeDebits: 0n,
      cumulativeCredits: 0n,
      pendingDebits: 0n,
      pendingCredits: 0n,
      createdAt: Date.now(),
    });

    const journalEntry = await postEntry(ctx, {
      entryType: "MORTGAGE_MINTED",
      mortgageId: args.mortgageId,
      debitAccountId: treasuryId,
      creditAccountId: worldAccount._id,
      amount: Number(TOTAL_SUPPLY),
      effectiveDate: args.effectiveDate,
      idempotencyKey: args.idempotencyKey,
      source: args.source,
      metadata: args.metadata,
    });

    return { treasuryAccountId: treasuryId, journalEntry };
  })
  .public();
```

---

## Test Pattern (from existing `convex/ledger/__tests__/ledger.test.ts`)

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";

const LEDGER_TEST_IDENTITY = {
  name: "Test Admin",
  email: "admin@test.com",
  tokenIdentifier: "test|admin-001",
  subject: "user_test_admin_001",
  issuer: "https://api.workos.com/user_management/client_test",
  role: "admin",
  roles: ["admin"],
  permissions: ["ledger:view", "ledger:correct"],
  organization_id: "org_test_001",
  org_id: "org_test_001",
};

const SYS_SOURCE = { type: "system" as const };

// Pattern for creating a test and running mutations:
const t = convexTest(schema);
await t.run(async (ctx) => {
  // ... setup ...
});
const result = await t.mutation(api.ledger.mutations.mintMortgage, {
  mortgageId: "mortgage-test-1",
  effectiveDate: "2026-01-01",
  idempotencyKey: "mint-m1",
  source: SYS_SOURCE,
});

// Pattern for asserting ConvexError
await expect(
  t.mutation(api.ledger.mutations.mintMortgage, { ... })
).rejects.toThrow(/ALREADY_MINTED/);
```

Important test patterns from existing tests:
- Use `t.mutation(api.ledger.mutations.XXX, args)` for public mutations
- Use `t.run(async (ctx) => { ... })` for direct DB access in setup/assertions
- The test identity must have permissions matching the middleware chain
- For `ledgerMutation`, identity needs `ledger:correct` permission
- ConvexError assertions use `.rejects.toThrow(/ERROR_CODE/)` pattern

---

## Error Codes to Implement

| Error Code | Trigger | Stage |
|---|---|---|
| `ALLOCATIONS_SUM_MISMATCH` | Allocations don't sum to 10,000 | Pre-validation |
| `ALLOCATION_BELOW_MINIMUM` | Any allocation < 1,000 | Pre-validation |
| `ALREADY_MINTED` | TREASURY already exists for this mortgageId | Double-mint check |
| `IDEMPOTENT_REPLAY_FAILED` | Idempotent replay but TREASURY missing | Idempotency |
| `INVARIANT_VIOLATION` | TREASURY balance != 0 after full allocation | Belt-and-suspenders |

---

## Return Type Contract (for ENG-33 downstream)

```typescript
{
  treasuryAccountId: Id<"ledger_accounts">,
  mintEntry: Doc<"ledger_journal_entries">,
  issueEntries: Doc<"ledger_journal_entries">[]
}
```

---

## Implementation Details

### T-001: Add validators to `convex/ledger/validators.ts`

Add in the "Tier 2: Convenience Mutations" section, after `issueSharesArgsValidator`:

```typescript
export const allocationValidator = v.object({
  lenderId: v.string(),
  amount: v.number(),
});

export const mintAndIssueArgsValidator = {
  mortgageId: v.string(),
  allocations: v.array(allocationValidator),
  effectiveDate: v.string(),
  idempotencyKey: v.string(),
  source: eventSourceValidator,
  metadata: v.optional(v.any()),
};
```

### T-002: Add `mintAndIssue` to `convex/ledger/mutations.ts`

Add these imports at the top:
```typescript
import { MIN_FRACTION } from "./constants";
import { mintAndIssueArgsValidator } from "./validators";
```

Note: `ledgerMutation` is already imported. `TOTAL_SUPPLY` is already imported.

The mutation follows the same structure as `mintMortgage` but adds:
1. Pre-validation of allocations (sum check, min fraction check)
2. Loop over allocations to create POSITIONs and post SHARES_ISSUED
3. Belt-and-suspenders invariant check
4. Returns combined result

Key implementation notes:
- Validate BEFORE any DB writes (fail fast, zero side effects)
- Order: allocations validation → double-mint check → idempotency → mint → issue loop → invariant check
- Each SHARES_ISSUED gets derived idempotency key: `${args.idempotencyKey}:issue:${allocation.lenderId}`
- TREASURY creation uses same pattern as `mintMortgage` (raw insert with all bigint fields)
- Type annotation for `issueEntries` array: `Doc<"ledger_journal_entries">[]`
- Import `Doc` type from `"../_generated/dataModel"`

### T-003: Tests

Create `convex/ledger/__tests__/mintAndIssue.test.ts` with these test cases:

1. **Happy path — single allocation** (10,000 to one lender)
   - Returns treasuryAccountId, mintEntry, issueEntries[1]
   - TREASURY balance = 0, POSITION balance = 10,000

2. **Happy path — multiple allocations** (5,000 + 3,000 + 2,000)
   - Returns 3 issueEntries
   - Each POSITION balance matches allocation

3. **Happy path — two equal allocations** (5,000 + 5,000)
   - Both POSITIONs at 5,000

4. **Rejection: allocations sum < 10,000** → ALLOCATIONS_SUM_MISMATCH
   - Assert no TREASURY created (zero side effects)

5. **Rejection: allocations sum > 10,000** → ALLOCATIONS_SUM_MISMATCH

6. **Rejection: allocation < 1,000** → ALLOCATION_BELOW_MINIMUM

7. **Rejection: double-mint** (call twice, different idempotency keys) → ALREADY_MINTED

8. **Idempotency replay** (call twice, same idempotency key) → returns same result

### T-004: Quality Gates

Run in order:
1. `bunx convex codegen`
2. `bun check`
3. `bun typecheck`
4. `bun run test`
