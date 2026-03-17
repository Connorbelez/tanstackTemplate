# Chunk 1 Context: postCorrection

## Validator (already exists in validators.ts:122-135)

```typescript
export const postCorrectionArgsValidator = {
  mortgageId: v.string(),
  debitAccountId: v.id("ledger_accounts"),
  creditAccountId: v.id("ledger_accounts"),
  amount: v.number(),
  effectiveDate: v.string(),
  idempotencyKey: v.string(),
  source: eventSourceValidator,
  causedBy: v.id("ledger_journal_entries"),
  reason: v.string(),
  metadata: v.optional(v.any()),
};
```

## postEntry CORRECTION handling (postEntry.ts:267-292)

The typeCheck step already validates CORRECTION entries:
- `source.type` must be `"user"` → error code `CORRECTION_REQUIRES_ADMIN`
- `source.actor` must be set → error code `CORRECTION_REQUIRES_ADMIN`
- `causedBy` must be provided → error code `CORRECTION_REQUIRES_CAUSED_BY`
- `reason` must be provided → error code `CORRECTION_REQUIRES_REASON`

## CORRECTION constraint check (postEntry.ts:434-448)

```typescript
function constraintCorrection(ctx: ConstraintContext): void {
  if (ctx.debitAccount.type === "POSITION") {
    const debitAfter = getPostedBalance(ctx.debitAccount) + ctx.amountBigInt;
    checkMinPosition(debitAfter, "Corrected debit position");
  }
  if (ctx.creditAccount.type === "POSITION") {
    const creditAfter = getPostedBalance(ctx.creditAccount) - ctx.amountBigInt;
    checkMinPosition(creditAfter, "Corrected credit position");
  }
}
```

## ENTRY_TYPE_ACCOUNT_MAP for CORRECTION (types.ts:63)
```typescript
CORRECTION: { debit: ALL_ACCOUNT_TYPES, credit: ALL_ACCOUNT_TYPES },
```

## Existing mutation patterns to follow

`burnMortgage` is the closest pattern — it's an `adminMutation` with `.input().handler().public()`:

```typescript
export const burnMortgage = adminMutation
  .input(burnMortgageArgsValidator)
  .handler(async (ctx, args) => {
    // ... validation ...
    return postEntry(ctx, { ... });
  })
  .public();
```

## Test patterns to follow

Test file: `convenienceMutations.test.ts` — uses `createTestHarness()`, `asLedgerUser()`, `initCounter()`, `mintAndIssue()`, `getConvexErrorCode()` from testUtils.ts.

**Admin user source for corrections:**
```typescript
const ADMIN_SOURCE = { type: "user" as const, actor: "admin-user-123" };
```

**Error assertion pattern:**
```typescript
try {
  await auth.mutation(api.ledger.mutations.postCorrection, { ... });
  expect.fail("Expected rejection");
} catch (error) {
  expect(getConvexErrorCode(error)).toBe("CORRECTION_REQUIRES_ADMIN");
}
```

## File paths
- Modify: `convex/ledger/mutations.ts` (add postCorrection + import)
- Modify: `convex/ledger/__tests__/convenienceMutations.test.ts` (add test block)
- Read-only: `convex/ledger/postEntry.ts`, `convex/ledger/validators.ts`, `convex/ledger/types.ts`
