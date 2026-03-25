# Chunk 3 Context: E2E Scenarios 4–8

## What You're Building
Remaining 5 scenarios in the `e2eLifecycle.test.ts` file (which already exists from chunk 2).

## File: `convex/payments/cashLedger/__tests__/e2eLifecycle.test.ts` (MODIFY — add scenarios 4-8)

## Scenarios 4 & 5: Reversal (SKIP)

`postPaymentReversalCascade` from ENG-172 does NOT exist in the codebase. Use `it.skip`:

```typescript
it.skip("scenario 4: reversal — settled cash receipt reversed, payables reversed", async () => {
  // Depends on ENG-172: postPaymentReversalCascade not yet implemented
  // When implemented:
  // 1. Full lifecycle (accrue → receive → allocate)
  // 2. Call postPaymentReversalCascade(ctx, { originalAttemptId })
  // 3. Verify BORROWER_RECEIVABLE balance reverts to outstanding
  // 4. Verify getJournalSettledAmountForObligation reflects reversal
  // 5. Verify LENDER_PAYABLE balances reversed
});

it.skip("scenario 5: reversal after payout — clawback entry created", async () => {
  // Depends on ENG-172: postPaymentReversalCascade not yet implemented
  // When implemented:
  // 1. Full lifecycle including payout
  // 2. Call postPaymentReversalCascade
  // 3. Verify LENDER_PAYABLE goes negative (clawback receivable)
});
```

## Scenario 6: Admin Correction

### Flow
1. Seed entities + create due obligation
2. Accrue receivable
3. Post cash receipt with WRONG amount (e.g., 90_000 instead of 100_000)
4. Call `postCashCorrectionForEntry` with the wrong entry ID
   - This posts a REVERSAL (swapped accounts) + optional replacement entry
5. Verify: original entry is reversed
6. Verify: replacement entry has correct amount (100_000)
7. Verify: BORROWER_RECEIVABLE net balance is correct
8. Run conservation checks

### postCashCorrectionForEntry API (integrations.ts)
```typescript
await postCashCorrectionForEntry(ctx, {
  originalEntryId: wrongEntryId,  // Id<"cash_ledger_journal_entries">
  reason: "Incorrect amount — should be 100,000 not 90,000",
  source: ADMIN_SOURCE,  // MUST be actorType: "admin"
  replacement: {
    amount: 100_000,
    debitAccountId: trustCashAccountId,
    creditAccountId: receivableAccountId,
    entryType: "CASH_RECEIVED",
  },
});
```

**Key**: Corrections require `ADMIN_SOURCE` (actorType: "admin"). Use the constant from testUtils.ts.

### Finding the wrong entry for correction
After posting the wrong cash receipt, query journal entries to find it:
```typescript
const wrongEntry = await ctx.db
  .query("cash_ledger_journal_entries")
  .withIndex("by_obligation_and_sequence", (q) =>
    q.eq("obligationId", obligationId)
  )
  .filter((q) => q.eq(q.field("entryType"), "CASH_RECEIVED"))
  .first();
```

## Scenario 7: Partial Waiver

### Flow
1. Seed entities + create due obligation (100,000 cents)
2. Accrue receivable (BORROWER_RECEIVABLE = 100,000)
3. Call `postObligationWaiver`:
```typescript
await postObligationWaiver(ctx, {
  obligationId,
  amount: 30_000,
  reason: "Partial waiver — borrower hardship",
  idempotencyKey: buildIdempotencyKey("waiver", obligationId),
  source: ADMIN_SOURCE,
  outstandingBefore: 100_000,
  outstandingAfter: 70_000,
  isFullWaiver: false,
});
```
4. Verify: BORROWER_RECEIVABLE balance reduced by 30,000 (net = 70,000)
5. Verify: CONTROL:WAIVER balance = 30,000
6. Remaining 70,000 is still collectible — post cash receipt for 70,000 to prove it

## Scenario 8: Full Write-Off

### Flow
1. Seed entities + create due obligation (100,000 cents)
2. Accrue receivable
3. Call `postObligationWriteOff`:
```typescript
await postObligationWriteOff(ctx, {
  obligationId,
  amount: 100_000,
  reason: "Borrower declared bankruptcy — full write-off",
  idempotencyKey: buildIdempotencyKey("write-off", obligationId),
  source: ADMIN_SOURCE,
});
```
4. Verify: WRITE_OFF account balance = 100,000
5. Verify: BORROWER_RECEIVABLE net balance = 0

### postObligationWriteOff details
- Validates: write-off amount ≤ outstanding BORROWER_RECEIVABLE balance
- Has early idempotency check (allows retries even after balance changed)
- Posts: OBLIGATION_WRITTEN_OFF: Debit WRITE_OFF, Credit BORROWER_RECEIVABLE

### Account Balance Verification Pattern
```typescript
await t.run(async (ctx) => {
  const accounts = await ctx.db
    .query("cash_ledger_accounts")
    .withIndex("by_family_and_obligation", (q) =>
      q.eq("family", "BORROWER_RECEIVABLE").eq("obligationId", obligationId)
    )
    .collect();
  const account = accounts[0];
  const balance = getCashAccountBalance(account);
  expect(balance).toBe(0n);  // BigInt assertion
});
```

## Key Imports Already Present (from chunk 2)
- `postObligationWaiver`, `postObligationWriteOff`, `postCashCorrectionForEntry` from `../integrations`
- `ADMIN_SOURCE` from `./testUtils`
- `buildIdempotencyKey` from `../types`
- `getCashAccountBalance`, `getOrCreateCashAccount` from `../accounts`
- All e2eHelpers assertions

## Constraints
- Scenarios 4 & 5 MUST use `it.skip` — not `it.todo` or commented out
- Include clear `// Depends on ENG-172` comment in skip body
- Admin correction (scenario 6) requires `ADMIN_SOURCE` (actorType: "admin")
- All assertions use BigInt
- Each scenario is independent — seeds its own entities via beforeEach or inline seeding
