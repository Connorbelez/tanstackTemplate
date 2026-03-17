# Chunk 01 Context: Core postEntry Pipeline

## What This Chunk Does
Create `convex/ledger/postEntry.ts` — the 9-step pipeline that is the **only code path** for modifying accounts or inserting journal entries. This is a plain async function (NOT a Convex mutation) called from within mutations.

## The 9-Step Pipeline
1. **VALIDATE_INPUT** — amount must be finite, integer, safe integer, positive; accounts must be different
2. **IDEMPOTENCY** — query by idempotencyKey, return existing if found
3. **RESOLVE_ACCOUNTS** — load debit + credit accounts from DB
4. **TYPE_CHECK** — verify entryType matches account types using `ENTRY_TYPE_ACCOUNT_MAP`
5. **BALANCE_CHECK** — verify credit account has sufficient *available* balance. WORLD exempt. AUDIT_ONLY exempt.
6. **CONSTRAINT_CHECK** — entry-type-specific rules (10,000 mint amount, min fraction, burn prerequisites, correction requirements)
7. **SEQUENCE** — get next monotonic sequence number via `getNextSequenceNumber`
8. **PERSIST** — atomic write: patch accounts (skip for AUDIT_ONLY), insert journal entry
9. **NUDGE** — no-op stub for now

## Available Infrastructure (from ENG-28)

### `convex/ledger/accounts.ts`
```typescript
export function getPostedBalance(account): bigint
// Returns cumulativeDebits - cumulativeCredits

export function getAvailableBalance(account): bigint
// Returns posted - pendingCredits
```

### `convex/ledger/sequenceCounter.ts`
```typescript
export async function getNextSequenceNumber(ctx: MutationCtx): Promise<bigint>
// Reads singleton counter, increments, patches, returns new value
// Throws ConvexError if not initialized
```

### `convex/ledger/types.ts`
```typescript
export type EntryType = "MORTGAGE_MINTED" | "SHARES_ISSUED" | "SHARES_TRANSFERRED" | "SHARES_REDEEMED" | "MORTGAGE_BURNED" | "SHARES_RESERVED" | "SHARES_COMMITTED" | "SHARES_VOIDED" | "CORRECTION";
export type AccountType = "WORLD" | "TREASURY" | "POSITION";
export interface EventSource { type: "user"|"system"|"webhook"|"cron"; actor?: string; channel?: string }

export const ENTRY_TYPE_ACCOUNT_MAP: Record<EntryType, { debit: readonly AccountType[]; credit: readonly AccountType[] }>
// MORTGAGE_MINTED:     debit: ["TREASURY"],  credit: ["WORLD"]
// SHARES_ISSUED:       debit: ["POSITION"],  credit: ["TREASURY"]
// SHARES_TRANSFERRED:  debit: ["POSITION"],  credit: ["POSITION"]
// SHARES_REDEEMED:     debit: ["TREASURY"],  credit: ["POSITION"]
// MORTGAGE_BURNED:     debit: ["WORLD"],     credit: ["TREASURY"]
// SHARES_RESERVED:     debit: ["POSITION"],  credit: ["POSITION"]
// SHARES_COMMITTED:    debit: ["POSITION"],  credit: ["POSITION"]
// SHARES_VOIDED:       debit: ["POSITION"],  credit: ["POSITION"]
// CORRECTION:          debit: ALL,           credit: ALL
```

### `convex/ledger/constants.ts`
```typescript
export const TOTAL_SUPPLY = 10_000n;
export const MIN_FRACTION = 1_000n;
```

### Schema (relevant fields)
- `ledger_journal_entries.amount` is `v.number()` — NOT `v.int64()`
- `ledger_journal_entries.reservationId` is `v.optional(v.id("ledger_reservations"))`
- `ledger_accounts` has `pendingDebits: v.int64()` and `pendingCredits: v.int64()` (non-optional)
- `ledger_accounts` has `cumulativeDebits: v.int64()` and `cumulativeCredits: v.int64()`

## PostEntryInput Interface
```typescript
export interface PostEntryInput {
  entryType: EntryType;
  mortgageId: string;
  debitAccountId: Id<"ledger_accounts">;   // account RECEIVING units
  creditAccountId: Id<"ledger_accounts">; // account GIVING units
  amount: number;                          // v.number() — integer, converted to BigInt internally
  effectiveDate: string;
  idempotencyKey: string;
  source: EventSource;
  causedBy?: Id<"ledger_journal_entries">;
  reason?: string;
  reservationId?: Id<"ledger_reservations">;
  metadata?: Record<string, unknown>;
}
```

IMPORTANT: `amount` is `number` (matching `v.number()` in schema/validators), NOT bigint. Convert to BigInt for arithmetic with cumulative fields.

## Convention D-7
debitAccountId = account RECEIVING units, creditAccountId = account GIVING units.

## AUDIT_ONLY Entry Types
Add to `constants.ts`:
```typescript
export const AUDIT_ONLY_ENTRY_TYPES: ReadonlySet<string> = new Set([
  "SHARES_RESERVED",
  "SHARES_VOIDED",
]);
```
These create journal entries but do NOT update cumulativeDebits/cumulativeCredits. SHARES_COMMITTED updates cumulatives normally.

## Type Check Details
Use `ENTRY_TYPE_ACCOUNT_MAP` from `./types.ts`. For each entry type, verify that `debitAccount.type` is in the allowed debit types and `creditAccount.type` is in the allowed credit types.

Additional type-check rules:
- For SHARES_TRANSFERRED, SHARES_RESERVED, SHARES_COMMITTED, SHARES_VOIDED: both accounts must have same `mortgageId`
- For SHARES_ISSUED, SHARES_REDEEMED: both accounts must have same `mortgageId`
- For CORRECTION: if both accounts have `mortgageId`, they must match

## Balance Check Rules
- WORLD is exempt (can go negative)
- AUDIT_ONLY types exempt (don't move posted balance)
- Use `getAvailableBalance(creditAccount)` — this accounts for pending reservations
- If available < amount, throw ConvexError `INSUFFICIENT_BALANCE`

## Constraint Check Strategy Map
| Entry Type | Constraints |
|---|---|
| MORTGAGE_MINTED | amount == TOTAL_SUPPLY (10,000) |
| MORTGAGE_BURNED | amount == TOTAL_SUPPLY; credit (TREASURY) posted balance == TOTAL_SUPPLY |
| SHARES_ISSUED | min position on debit (POSITION) after |
| SHARES_TRANSFERRED | min position on credit (seller) after; min position on debit (buyer) after |
| SHARES_REDEEMED | min position on credit (POSITION) after |
| SHARES_RESERVED | min position on credit (seller) after (using available); min position on debit (buyer) after |
| SHARES_COMMITTED | no additional constraints (reservation already validated) |
| SHARES_VOIDED | no additional constraints |
| CORRECTION | source.type == "user"; causedBy required; reason required; min position on affected POSITIONs |

## Min Position Rule (REQ-84)
```typescript
function checkMinPosition(resultingBalance: bigint, label: string): void {
  if (resultingBalance !== 0n && resultingBalance < MIN_FRACTION) {
    throw new ConvexError({
      code: "MIN_FRACTION_VIOLATED",
      message: `${label} balance ${resultingBalance} violates minimum (must be 0 or >= ${MIN_FRACTION})`,
      label,
      resultingBalance: Number(resultingBalance),
      minimum: Number(MIN_FRACTION),
    });
  }
}
```

## ConvexError Codes
| Code | When |
|------|------|
| INVALID_AMOUNT | not finite, not integer, not safe integer, or <= 0 |
| SAME_ACCOUNT | debit === credit |
| ACCOUNT_NOT_FOUND | account doesn't exist in DB |
| TYPE_MISMATCH | entryType doesn't match account types |
| MORTGAGE_MISMATCH | cross-mortgage operation |
| INSUFFICIENT_BALANCE | credit account available balance < amount |
| INVALID_MINT_AMOUNT | MORTGAGE_MINTED amount != 10,000 |
| INVALID_BURN_AMOUNT | MORTGAGE_BURNED amount != 10,000 |
| TREASURY_NOT_FULL | MORTGAGE_BURNED but treasury != 10,000 |
| MIN_FRACTION_VIOLATED | resulting POSITION between 1-999 |
| CORRECTION_REQUIRES_ADMIN | correction source.type != "user" |
| CORRECTION_REQUIRES_CAUSED_BY | correction missing causedBy |
| CORRECTION_REQUIRES_REASON | correction missing reason |

## Imports
```typescript
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getAvailableBalance, getPostedBalance } from "./accounts";
import { AUDIT_ONLY_ENTRY_TYPES, MIN_FRACTION, TOTAL_SUPPLY } from "./constants";
import { getNextSequenceNumber } from "./sequenceCounter";
import { ENTRY_TYPE_ACCOUNT_MAP, type AccountType, type EntryType, type EventSource } from "./types";
```

## Nudge Step (stub)
```typescript
async function nudge(_ctx: MutationCtx): Promise<void> {
  // No-op: cursor consumers not built yet.
  // When implemented, this will call ctx.scheduler.runAfter(0, internal.ledger.cursors.nudgeConsumers, { sequenceNumber })
}
```

## Files to Create/Modify
- **Create**: `convex/ledger/postEntry.ts`
- **Modify**: `convex/ledger/constants.ts` (add AUDIT_ONLY_ENTRY_TYPES)
