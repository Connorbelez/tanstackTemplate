# Chunk 03 Context: Mutations Refactor

## What This Chunk Does
Remove the old `postEntryInternal` and all validation helpers from `mutations.ts`. Wire convenience mutations to use the new `postEntry` from `./postEntry`. Create `postEntryDirect` internalMutation for test access.

## Current State of mutations.ts

### What to REMOVE (lines 22-293):
1. `PostEntryInput` interface (lines 27-43) — now in postEntry.ts
2. `postEntryInternal` function (lines 50-118)
3. ALL validation helpers:
   - `assertAccountType` (lines 122-130)
   - `assertMortgageMatch` (lines 132-142)
   - `checkMinPosition` (lines 144-150)
   - `ValidationContext` interface (lines 152-158)
   - `validateMortgageMinted` (lines 160-168)
   - `validateSharesIssued` (lines 170-181)
   - `validateSharesTransferred` (lines 183-195)
   - `validateSharesRedeemed` (lines 197-208)
   - `validateMortgageBurned` (lines 210-223)
   - `validateCorrection` (lines 225-269)
   - `VALIDATORS` record (lines 271-278)
   - `validateEntryType` function (lines 280-293)
4. `type EntryType` and `type AccountType` (lines 24-25)

### What to REMOVE (line 297-302):
The public `postEntry` mutation export:
```typescript
export const postEntry = ledgerMutation
  .input(postEntryArgsValidator)
  .handler(async (ctx, args) => {
    return postEntryInternal(ctx, args);
  })
  .public();
```

### What to KEEP (modified):
All convenience mutations stay but change `postEntryInternal(ctx, ...)` → `postEntry(ctx, ...)`:
- `mintMortgage` (lines 304-368)
- `burnMortgage` (lines 370-422)
- `issueShares` (lines 426-451)
- `transferShares` (lines 453-482)
- `redeemShares` (lines 484-508)

### What to ADD:

1. Import at top:
```typescript
import { postEntry } from "./postEntry";
import type { PostEntryInput } from "./postEntry";
import { internalMutation } from "../_generated/server";
```

2. `postEntryDirect` internalMutation for test access:
```typescript
export const postEntryDirect = internalMutation({
  args: postEntryArgsValidator,
  handler: async (ctx, args) => {
    return postEntry(ctx, args);
  },
});
```

## Current Imports in mutations.ts
```typescript
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ledgerMutation } from "../fluent";
import { MIN_POSITION_UNITS, UNITS_PER_MORTGAGE } from "./constants";
import {
  computeBalance,
  getOrCreatePositionAccount,
  getOrCreateWorldAccount,
  getPositionAccount,
  getTreasuryAccount,
  nextSequenceNumber,
} from "./internal";
import {
  burnMortgageArgsValidator,
  issueSharesArgsValidator,
  mintMortgageArgsValidator,
  postEntryArgsValidator,
  redeemSharesArgsValidator,
  transferSharesArgsValidator,
} from "./validators";
```

After refactor, imports should be:
```typescript
import { ConvexError } from "convex/values";
import { internalMutation } from "../_generated/server";
import { ledgerMutation } from "../fluent";
import { UNITS_PER_MORTGAGE } from "./constants";
import {
  computeBalance,
  getOrCreatePositionAccount,
  getOrCreateWorldAccount,
  getPositionAccount,
  getTreasuryAccount,
} from "./internal";
import { postEntry } from "./postEntry";
import {
  burnMortgageArgsValidator,
  issueSharesArgsValidator,
  mintMortgageArgsValidator,
  postEntryArgsValidator,
  redeemSharesArgsValidator,
  transferSharesArgsValidator,
} from "./validators";
```

Note: `MIN_POSITION_UNITS` and `nextSequenceNumber` are no longer needed in mutations.ts (they're used in postEntry.ts).

## ConvexError Migration in Convenience Mutations
The convenience mutations still have `throw new Error(...)` calls. Migrate these to `ConvexError`:

**mintMortgage:**
- `"Idempotent mint replay: TREASURY for ${args.mortgageId} not found"` → ConvexError code: "IDEMPOTENT_REPLAY_FAILED"
- `"Mortgage ${args.mortgageId} already minted (TREASURY exists)"` → ConvexError code: "ALREADY_MINTED"

**burnMortgage:**
- `"Cannot burn: TREASURY balance is..."` → ConvexError code: "TREASURY_NOT_FULL"
- `"Cannot burn: POSITION ${pos._id} (lender ${pos.lenderId}) has non-zero balance"` → ConvexError code: "POSITIONS_NOT_ZERO"

## Downstream Contract
The `postEntry` function signature (from postEntry.ts) that convenience mutations call:
```typescript
export async function postEntry(
  ctx: MutationCtx,
  args: PostEntryInput
): Promise<Doc<"ledger_journal_entries">>
```

All 6 downstream issues (ENG-29, 30, 31, 32, 34, 38) depend on this contract.

## Files to Modify
- **Modify**: `convex/ledger/mutations.ts` (heavy refactor — remove ~270 lines, add ~15 lines)
