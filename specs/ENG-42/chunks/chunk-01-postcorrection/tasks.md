# Chunk 1: postCorrection Mutation + Tests

## Tasks

### T-001: Implement `postCorrection` adminMutation
**File:** `convex/ledger/mutations.ts`

Add `postCorrection` as an `adminMutation` (same pattern as `burnMortgage`). It's the simplest convenience mutation — a thin wrapper that calls `postEntry` with `entryType: "CORRECTION"`.

```typescript
export const postCorrection = adminMutation
  .input(postCorrectionArgsValidator)
  .handler(async (ctx, args) => {
    return postEntry(ctx, {
      entryType: "CORRECTION",
      mortgageId: args.mortgageId,
      debitAccountId: args.debitAccountId,
      creditAccountId: args.creditAccountId,
      amount: args.amount,
      effectiveDate: args.effectiveDate,
      idempotencyKey: args.idempotencyKey,
      source: args.source,
      causedBy: args.causedBy,
      reason: args.reason,
      metadata: args.metadata,
    });
  })
  .public();
```

**Key constraints (enforced by postEntry typeCheck step 4):**
- `source.type` must be `"user"`
- `source.actor` must be set
- `causedBy` must be provided (presence check only — referenced entry existence is NOT verified at runtime)
- `reason` must be a non-empty string

### T-002: Import `postCorrectionArgsValidator`
**File:** `convex/ledger/mutations.ts`

Add `postCorrectionArgsValidator` to the imports from `./validators`.

### T-003: Write postCorrection tests
**File:** `convex/ledger/__tests__/convenienceMutations.test.ts`

Add a new `describe("postCorrection")` block with these test scenarios:

1. **Happy path: creates offset entry referencing original, original unmodified**
   - issueShares 5000 to A
   - postCorrection: debit=TREASURY, credit=A.position, amount=500, causedBy=originalEntry._id
   - Original entry unchanged (immutability)
   - New CORRECTION entry has causedBy pointing to original
   - A.posted = 4500, TREASURY.posted = 5500

2. **Requires admin source (source.type='user' with actor)**
   - Attempt with source.type='system' → CORRECTION_REQUIRES_ADMIN
   - Attempt with source.type='user' but no actor → CORRECTION_REQUIRES_ADMIN

3. **Requires causedBy reference**
   - Attempt without causedBy → CORRECTION_REQUIRES_CAUSED_BY

4. **Requires reason string**
   - Attempt without reason → CORRECTION_REQUIRES_REASON

5. **Idempotency: same idempotencyKey returns existing entry**

6. **Min-fraction enforcement on POSITION corrections**
   - Correction that leaves position at 500 (between 1-999) → MIN_FRACTION_VIOLATED
   - Correction that leaves position at exactly 0 → accepted (sell-all exception)

### T-004: Quality gate
Run `bun check`, `bun typecheck`, `bunx convex codegen`.
