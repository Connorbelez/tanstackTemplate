# Chunk 1 Context: Backend Implementation

## Linear Issue Summary
**ENG-168: Phase 4: Admin correction workflow**
Admin/system mutation to correct erroneous journal entries via append-only reversal and re-posting. No entry is ever mutated or deleted.

## Acceptance Criteria
- Original entry remains unchanged after correction
- Correction entry has `causedBy` referencing original
- Net balance reflects corrected state
- Full correction chain is auditable
- Reversal amount cannot exceed original amount

## What's Already Built (DO NOT modify these files)
The core posting pipeline already has full CORRECTION support:
- `constraintCheck()` enforces: admin actorType, actorId, causedBy, reason for CORRECTION
- `balanceCheck()` returns early for CORRECTION and REVERSAL
- `CASH_ENTRY_TYPE_FAMILY_MAP.CORRECTION` = ALL_FAMILIES (debit and credit)
- `by_caused_by` index exists on `cash_ledger_journal_entries`
- `postCashEntryInternal()` handles the full 9-step validation pipeline
- `buildIdempotencyKey()` helper exists in types.ts

## Files to Modify

### T-001: `convex/payments/cashLedger/validators.ts`
Add a new validator for the correction mutation args:
```typescript
export const postCashCorrectionArgsValidator = {
  originalEntryId: v.id("cash_ledger_journal_entries"),
  reason: v.string(),
  source: sourceValidator,
  effectiveDate: v.string(),
  replacement: v.optional(v.object({
    amount: v.number(),
    debitAccountId: v.id("cash_ledger_accounts"),
    creditAccountId: v.id("cash_ledger_accounts"),
    entryType: cashEntryTypeValidator,
    metadata: v.optional(v.any()),
  })),
};
```

### T-002: `convex/payments/cashLedger/mutations.ts`
Add `postCashCorrection` internalMutation. This is the orchestration mutation:

1. Load original entry via `ctx.db.get(args.originalEntryId)`
2. Validate original entry exists
3. Generate `postingGroupId`: `correction:{originalId}:{timestamp}`
4. Create REVERSAL entry — mirror of original with debit/credit SWAPPED:
   - `entryType: "REVERSAL"`
   - `amount: original.amount` (always full reversal)
   - `debitAccountId: original.creditAccountId` (SWAPPED)
   - `creditAccountId: original.debitAccountId` (SWAPPED)
   - `causedBy: original._id`
   - `postingGroupId: postingGroupId`
   - `reason: args.reason`
   - `source: args.source`
   - `idempotencyKey: buildIdempotencyKey("correction-reversal", original._id)`
   - Carry forward: mortgageId, obligationId, attemptId, dispersalEntryId, lenderId, borrowerId
5. Optionally create replacement entry if `args.replacement` is provided:
   - Validate: `replacement.amount` must be a positive safe integer and must not exceed `Number(original.amount)`
   - Uses `args.replacement.entryType`, `args.replacement.debitAccountId`, `args.replacement.creditAccountId`
   - `causedBy: original._id`
   - `postingGroupId: postingGroupId`
   - `idempotencyKey: buildIdempotencyKey("correction-replacement", original._id)`
   - Carry forward: mortgageId, obligationId, lenderId, borrowerId from original
6. Return `{ reversalEntry, replacementEntry, postingGroupId }`

**Key design decisions:**
- Reversal is always for the FULL amount (append-only invariant)
- Replacement can be for a DIFFERENT amount (partial corrections: reverse full, post corrected + remainder as separate entries)
- The pipeline's `constraintCheck` will enforce admin/causedBy/reason for the REVERSAL entry type (causedBy is required)
- The replacement entry uses a caller-specified entryType (e.g., the same type as the original, or CORRECTION)
- `amount` is stored as `bigint` in the DB but passed as `number` — use `Number(original.amount)` for comparisons

**Important:** The `original.amount` field is a `bigint` from the database. Use `Number(original.amount)` when comparing with `args.replacement.amount`.

### T-003: `convex/payments/cashLedger/integrations.ts`
Add `postCashCorrectionForEntry` — a higher-level helper that loads the original entry, resolves accounts, and calls `postCashEntryInternal` directly (same pattern as other integration functions).

```typescript
export async function postCashCorrectionForEntry(
  ctx: MutationCtx,
  args: {
    originalEntryId: Id<"cash_ledger_journal_entries">;
    reason: string;
    source: CommandSource;
    effectiveDate?: string;
    replacement?: {
      amount: number;
      debitAccountId: Id<"cash_ledger_accounts">;
      creditAccountId: Id<"cash_ledger_accounts">;
      entryType: CashEntryType;
      metadata?: Record<string, unknown>;
    };
  }
)
```

This follows the integration pattern of `postCashReceiptForObligation`, `postSettlementAllocation`, etc.:
- Loads original entry
- Validates it exists
- Generates postingGroupId
- Creates reversal via `postCashEntryInternal`
- Optionally creates replacement via `postCashEntryInternal`
- Returns `{ reversalEntry, replacementEntry, postingGroupId }`
- Default effectiveDate: `new Date().toISOString().slice(0, 10)`

## Existing Patterns to Follow

### Import Pattern (mutations.ts)
```typescript
import { ConvexError, v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { sourceValidator } from "../../engine/validators";
import { postCashEntryInternal } from "./postEntry";
```

### Import Pattern (integrations.ts)
```typescript
import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { CommandSource } from "../../engine/types";
import { postCashEntryInternal } from "./postEntry";
import { buildIdempotencyKey } from "./types";
```

### Integration Helper Pattern
All integration helpers:
1. Take a `MutationCtx` + typed args
2. Load referenced entities from DB
3. Validate existence
4. Call `postCashEntryInternal()` with fully resolved args
5. Return the result

### buildIdempotencyKey Usage
```typescript
import { buildIdempotencyKey } from "./types";
buildIdempotencyKey("correction-reversal", original._id)
buildIdempotencyKey("correction-replacement", original._id)
```

## Constraints
- All amounts are safe integers in cents. No floating-point arithmetic.
- `source` uses `CommandSource` type from `../../engine/types`.
- The `sourceValidator` from `../../engine/validators` is already used in validators.ts.
- No journal entry is ever mutated or deleted. Corrections are new entries with `causedBy`.
- Run `bunx convex codegen`, `bun check`, `bun typecheck` after changes.
