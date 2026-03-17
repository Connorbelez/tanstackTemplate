# Chunk 02 Context: Mutations Refactor

## What This Chunk Does
Remove old `postEntryInternal` + all validation helpers from `mutations.ts`. Wire convenience mutations to the new `postEntry` from `./postEntry`. Add `postEntryDirect` internalMutation for test access.

## What to REMOVE from mutations.ts

### Lines 24-38: `PostEntryInput` interface
Now exported from `./postEntry.ts`.

### Lines 45-123: `postEntryInternal` function
Replaced by `postEntry` from `./postEntry.ts`.

### Lines 125-316: ALL validation helpers
- `assertAccountType`
- `assertMortgageMatch`
- `checkMinPosition`
- `ValidationContext` interface
- `validateMortgageMinted`, `validateSharesIssued`, `validateSharesTransferred`, `validateSharesRedeemed`, `validateMortgageBurned`, `validateCorrection`
- `rejectReservationViaPostEntry`
- `VALIDATORS` record
- `validateEntryType` function

### Lines 320-325: Public `postEntry` export
```typescript
export const postEntry = ledgerMutation
  .input(postEntryArgsValidator)
  .handler(async (ctx, args) => {
    return postEntryInternal(ctx, args);
  })
  .public();
```

## What to ADD

### Import
```typescript
import { ConvexError } from "convex/values";
import { internalMutation } from "../_generated/server";
import { postEntry } from "./postEntry";
```

### `postEntryDirect` internalMutation (replaces public postEntry)
```typescript
export const postEntryDirect = internalMutation({
  args: postEntryArgsValidator,
  handler: async (ctx, args) => {
    return postEntry(ctx, args);
  },
});
```

## What to KEEP (modified)
All convenience mutations stay but change `postEntryInternal(ctx, ...)` → `postEntry(ctx, ...)`:
- `mintMortgage`
- `burnMortgage`
- `issueShares`
- `transferShares`
- `redeemShares`

## ConvexError Migration in Convenience Mutations

**mintMortgage:**
- `"Idempotent mint replay: TREASURY not found"` → ConvexError `{ code: "IDEMPOTENT_REPLAY_FAILED" }`
- `"already minted (TREASURY exists)"` → ConvexError `{ code: "ALREADY_MINTED" }`

**burnMortgage:**
- `"No TREASURY account"` → ConvexError `{ code: "TREASURY_NOT_FOUND" }`
- `"Cannot burn: TREASURY balance is..."` → ConvexError `{ code: "TREASURY_NOT_FULL" }`
- `"Cannot burn: POSITION has non-zero balance"` → ConvexError `{ code: "POSITIONS_NOT_ZERO" }`

**issueShares:**
- `"No TREASURY account"` → ConvexError `{ code: "TREASURY_NOT_FOUND" }`

**redeemShares:**
- `"No TREASURY account"` → ConvexError `{ code: "TREASURY_NOT_FOUND" }`

## Final imports after refactor
```typescript
import { ConvexError } from "convex/values";
import { internalMutation } from "../_generated/server";
import { ledgerMutation } from "../fluent";
import {
  getOrCreatePositionAccount,
  getPositionAccount,
  getPostedBalance,
  getTreasuryAccount,
  getWorldAccount,
  initializeWorldAccount,
} from "./accounts";
import { TOTAL_SUPPLY } from "./constants";
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

Note: `MIN_FRACTION`, `getNextSequenceNumber`, `AccountType`, `EntryType` no longer needed in mutations.ts.

## Files to Modify
- **Modify**: `convex/ledger/mutations.ts` (heavy refactor — remove ~290 lines, add ~15 lines)
