# Chunk 02 Context: Core postEntry Pipeline

## What This Chunk Does
Create `convex/ledger/postEntry.ts` — the 9-step pipeline that is the **only code path** for modifying accounts or inserting journal entries. This is a plain async function, NOT a Convex mutation — it's called from within mutations.

## The 9-Step Pipeline
1. **VALIDATE_INPUT** — amount > 0, both accounts provided and different, valid entry type
2. **IDEMPOTENCY** — query by idempotencyKey, return existing if found
3. **RESOLVE_ACCOUNTS** — load debit + credit accounts from DB
4. **TYPE_CHECK** — verify entryType matches account types (e.g., MORTGAGE_MINTED must be WORLD → TREASURY)
5. **BALANCE_CHECK** — verify credit account has sufficient *available* balance (posted - pendingCredits). WORLD exempt.
6. **CONSTRAINT_CHECK** — entry-type-specific rules (10,000 mint amount, min fraction, burn prerequisites, correction requirements)
7. **SEQUENCE** — get next monotonic sequence number
8. **PERSIST** — atomic write: patch debit account, patch credit account, insert journal entry, patch sequence counter
9. **NUDGE** — optional `ctx.scheduler.runAfter(0, ...)` to wake cursor consumers

## Convention D-7
debitAccountId = account RECEIVING units, creditAccountId = account GIVING units.
FROM→TO notation: FROM gives (credit), TO receives (debit).

## Key Types (from Chunk 01 — already in schema)

### PostEntryInput Interface
```typescript
export interface PostEntryInput {
  entryType: EntryType;  // 9 values
  mortgageId: string;
  debitAccountId: Id<"ledger_accounts">;   // account RECEIVING units
  creditAccountId: Id<"ledger_accounts">; // account GIVING units
  amount: bigint;
  effectiveDate: string;
  idempotencyKey: string;
  source: { type: "user" | "system" | "webhook" | "cron"; actor?: string; channel?: string };
  causedBy?: Id<"ledger_journal_entries">;
  reason?: string;
  reservationId?: string;
  metadata?: Record<string, unknown>;
}
```

### EntryType (9 values)
MORTGAGE_MINTED, SHARES_ISSUED, SHARES_TRANSFERRED, SHARES_REDEEMED, MORTGAGE_BURNED, SHARES_RESERVED, SHARES_COMMITTED, SHARES_VOIDED, CORRECTION

### AccountType (3 values)
WORLD, TREASURY, POSITION

## TYPE_CHECK_MATRIX
```typescript
const TYPE_CHECK_MATRIX: Record<EntryType, { debit: AccountType; credit: AccountType } | null> = {
  MORTGAGE_MINTED:     { debit: "TREASURY", credit: "WORLD" },
  SHARES_ISSUED:       { debit: "POSITION", credit: "TREASURY" },
  SHARES_TRANSFERRED:  { debit: "POSITION", credit: "POSITION" },
  SHARES_REDEEMED:     { debit: "TREASURY", credit: "POSITION" },
  MORTGAGE_BURNED:     { debit: "WORLD",    credit: "TREASURY" },
  SHARES_RESERVED:     { debit: "POSITION", credit: "POSITION" },
  SHARES_COMMITTED:    { debit: "POSITION", credit: "POSITION" },
  SHARES_VOIDED:       { debit: "POSITION", credit: "POSITION" },
  CORRECTION:          null, // any valid pair + causedBy required
};
```
For CORRECTION: allow any pair, but enforce causedBy and same-mortgage when both accounts belong to a mortgage.
For SHARES_TRANSFERRED/RESERVED/COMMITTED/VOIDED: enforce same mortgageId on both accounts.

## Balance Check Rules
- WORLD is exempt from balance constraints (it can go negative)
- AUDIT_ONLY entry types (SHARES_RESERVED, SHARES_VOIDED) don't move posted balance — skip balance check
- Available balance = posted balance - pendingCredits
- `getPostedBalance(account)` = `account.cumulativeDebits - account.cumulativeCredits` (same as existing `computeBalance`)
- `getAvailableBalance(account)` = `getPostedBalance(account) - (account.pendingCredits ?? 0n)`

### ENG-28 Note
ENG-28 hasn't landed yet. Define `getPostedBalance` and `getAvailableBalance` as local helper functions in postEntry.ts. Import `computeBalance` from `./internal` for backwards compat, or just reimplement the simple arithmetic locally. When ENG-28 lands, these helpers will move to `./accounts.ts`.

## Constraint Check Details

### MORTGAGE_MINTED
- amount must equal UNITS_PER_MORTGAGE (10,000)

### MORTGAGE_BURNED
- amount must equal UNITS_PER_MORTGAGE
- credit account (TREASURY) posted balance must equal UNITS_PER_MORTGAGE

### SHARES_ISSUED
- Check min position: debit account (POSITION) resulting balance >= MIN_POSITION_UNITS or == 0

### SHARES_TRANSFERRED
- Check min position: credit account post-transfer >= MIN_POSITION_UNITS or == 0 (sell-all)
- Check min position: debit account post-transfer >= MIN_POSITION_UNITS or == 0

### SHARES_REDEEMED
- Check min position: credit account (POSITION) post-redemption >= MIN_POSITION_UNITS or == 0

### SHARES_RESERVED
- Check min position: credit account post-reservation (using available balance) >= MIN_POSITION_UNITS or == 0
- Check min position: debit account post-reservation >= MIN_POSITION_UNITS or == 0

### SHARES_COMMITTED, SHARES_VOIDED
- No additional constraint checks (these resolve reservations)

### CORRECTION
- source.type must be "user" (admin)
- causedBy required
- reason required
- Same-mortgage check when both accounts belong to a mortgage
- Min position checks on affected POSITION accounts

## Min Position Rule (REQ-84)
Every non-zero POSITION must hold >= 1,000 units (10%). A POSITION can go to exactly 0 (full exit / sell-all exception). The constraint is: position is either 0 or >= 1,000.
```typescript
function checkMinPosition(resultingBalance: bigint, label: string): void {
  if (resultingBalance !== 0n && resultingBalance < MIN_POSITION_UNITS) {
    throw new ConvexError({
      code: "MIN_FRACTION_VIOLATED",
      label,
      resultingBalance: Number(resultingBalance),
      minimum: Number(MIN_POSITION_UNITS),
    });
  }
}
```

## Persist Step Details
- SHARES_RESERVED and SHARES_VOIDED are AUDIT_ONLY — do NOT update cumulativeDebits/cumulativeCredits
- SHARES_COMMITTED updates cumulatives normally
- All other types update cumulatives normally
- Insert journal entry with all fields including reservationId

## Sequence Number Strategy (Decision Point #1)
Keep the current `max(sequenceNumber) + 1` approach from `./internal.ts`:
```typescript
export async function nextSequenceNumber(ctx: QueryCtx): Promise<bigint> {
  const latest = await ctx.db
    .query("ledger_journal_entries")
    .withIndex("by_sequence")
    .order("desc")
    .first();
  return latest ? latest.sequenceNumber + 1n : 1n;
}
```
Import and use this directly. Add a comment documenting the decision: functionally equivalent to singleton counter under OCC.

## Nudge Step
```typescript
async function nudge(ctx: MutationCtx, sequenceNumber: bigint): Promise<void> {
  // Fire-and-forget: no nudgeConsumers function exists yet.
  // When cursor consumers are built, add:
  // await ctx.scheduler.runAfter(0, internal.ledger.cursors.nudgeConsumers, { sequenceNumber });
  // For now, this is a no-op stub.
}
```

## Error Codes (all ConvexError with structured data)
| Code | When |
|------|------|
| INVALID_AMOUNT | amount <= 0 |
| SAME_ACCOUNT | debit === credit |
| ACCOUNT_NOT_FOUND | account doesn't exist in DB |
| TYPE_MISMATCH | entryType doesn't match account types |
| MORTGAGE_MISMATCH | cross-mortgage transfer/reservation |
| INSUFFICIENT_BALANCE | credit account available balance < amount |
| INVALID_MINT_AMOUNT | MORTGAGE_MINTED amount != 10,000 |
| INVALID_BURN_AMOUNT | MORTGAGE_BURNED amount != 10,000 |
| TREASURY_NOT_FULL | MORTGAGE_BURNED but treasury != 10,000 |
| MIN_FRACTION_VIOLATED | resulting POSITION between 1-999 |
| CORRECTION_REQUIRES_ADMIN | correction source.type != "user" |
| CORRECTION_REQUIRES_CAUSED_BY | correction missing causedBy |
| CORRECTION_REQUIRES_REASON | correction missing reason |

## Imports Needed
```typescript
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { AUDIT_ONLY_ENTRY_TYPES, MIN_POSITION_UNITS, UNITS_PER_MORTGAGE } from "./constants";
import { computeBalance, nextSequenceNumber } from "./internal";
```

## Files to Create/Modify
- **Create**: `convex/ledger/postEntry.ts`
- No other files modified in this chunk
