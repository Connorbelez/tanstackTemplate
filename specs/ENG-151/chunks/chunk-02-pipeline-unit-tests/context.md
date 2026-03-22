# Chunk 02 Context: Pipeline Step Unit Tests

## Goal
Create `convex/payments/cashLedger/__tests__/postEntry.test.ts` — unit tests for each of the 9 pipeline steps in isolation using `postCashEntryInternal` directly.

## File to Create
`convex/payments/cashLedger/__tests__/postEntry.test.ts`

## Pipeline Under Test
From `convex/payments/cashLedger/postEntry.ts`:

```typescript
export async function postCashEntryInternal(ctx: MutationCtx, args: PostCashEntryInput) {
  // 1. VALIDATE_INPUT
  validateInput(args);
  // 2. IDEMPOTENCY
  const existing = await checkIdempotency(ctx, args.idempotencyKey);
  if (existing) return { entry: existing, projectedDebitBalance: 0n, projectedCreditBalance: 0n };
  // 3. RESOLVE_ACCOUNTS
  const { debitAccount, creditAccount } = await resolveAccounts(ctx, args);
  // 4. FAMILY_CHECK
  familyCheck(args, debitAccount, creditAccount);
  // 5. BALANCE_CHECK
  balanceCheck(args, debitAccount, creditAccount);
  // 6. CONSTRAINT_CHECK
  constraintCheck(args);
  // 7+8. SEQUENCE + PERSIST
  const result = await persistEntry(ctx, args, debitAccount, creditAccount);
  // 9. NUDGE
  await nudge(ctx);
  return result;
}
```

## PostCashEntryInput Interface
```typescript
export interface PostCashEntryInput {
  amount: number;
  attemptId?: Id<"collectionAttempts">;
  borrowerId?: Id<"borrowers">;
  causedBy?: Id<"cash_ledger_journal_entries">;
  creditAccountId: Id<"cash_ledger_accounts">;
  debitAccountId: Id<"cash_ledger_accounts">;
  dispersalEntryId?: Id<"dispersalEntries">;
  effectiveDate: string;
  entryType: CashEntryType;
  idempotencyKey: string;
  lenderId?: Id<"lenders">;
  metadata?: Record<string, unknown>;
  mortgageId?: Id<"mortgages">;
  obligationId?: Id<"obligations">;
  postingGroupId?: string;
  reason?: string;
  source: CommandSource;
}
```

## Validation Rules (Step 1)
- `!Number.isSafeInteger(args.amount) || args.amount <= 0` → "Cash ledger amount must be a positive safe integer"
- `args.debitAccountId === args.creditAccountId` → "Debit and credit accounts must be different"
- `!/^\d{4}-\d{2}-\d{2}$/.test(args.effectiveDate)` → "effectiveDate must be YYYY-MM-DD"

## Balance Check Rules (Step 5)
- REVERSAL, CORRECTION, SUSPENSE_ESCALATED → skip balance check entirely
- NEGATIVE_BALANCE_EXEMPT_FAMILIES = Set(["CONTROL", "BORROWER_RECEIVABLE"]) → skip negative check for these families
- All other families → `assertNonNegativeBalance` which calls `projectCashAccountBalance` and throws if < 0n

## Balance Convention
- Debit-normal families: balance = cumulativeDebits - cumulativeCredits (BORROWER_RECEIVABLE, TRUST_CASH, CASH_CLEARING, UNAPPLIED_CASH, WRITE_OFF, SUSPENSE, CONTROL)
- Credit-normal families: balance = cumulativeCredits - cumulativeDebits (LENDER_PAYABLE, SERVICING_REVENUE)

## Constraint Check Rules (Step 6)
- REVERSAL: requires `causedBy` (references existing entry)
- CORRECTION: requires `source.actorType === "admin"` AND `source.actorId` AND `causedBy` AND `reason`

## Entry-Type-to-Family Map
```typescript
OBLIGATION_ACCRUED:       { debit: ["BORROWER_RECEIVABLE"], credit: ["CONTROL"] }
CASH_RECEIVED:            { debit: ["TRUST_CASH", "CASH_CLEARING", "UNAPPLIED_CASH"], credit: ["BORROWER_RECEIVABLE"] }
CASH_APPLIED:             { debit: ["CONTROL", "UNAPPLIED_CASH"], credit: ["CONTROL", "BORROWER_RECEIVABLE"] }
LENDER_PAYABLE_CREATED:   { debit: ["CONTROL"], credit: ["LENDER_PAYABLE"] }
SERVICING_FEE_RECOGNIZED: { debit: ["CONTROL"], credit: ["SERVICING_REVENUE"] }
LENDER_PAYOUT_SENT:       { debit: ["LENDER_PAYABLE"], credit: ["TRUST_CASH"] }
OBLIGATION_WAIVED:        { debit: ["CONTROL"], credit: ["BORROWER_RECEIVABLE"] }
OBLIGATION_WRITTEN_OFF:   { debit: ["WRITE_OFF"], credit: ["BORROWER_RECEIVABLE"] }
REVERSAL:                 { debit: ALL_FAMILIES, credit: ALL_FAMILIES }
CORRECTION:               { debit: ALL_FAMILIES, credit: ALL_FAMILIES }
SUSPENSE_ESCALATED:       { debit: ["SUSPENSE"], credit: ["BORROWER_RECEIVABLE"] }
```

## Import Pattern
```typescript
import { describe, expect, it } from "vitest";
import { postCashEntryInternal, type PostCashEntryInput } from "../postEntry";
import { getOrCreateCashAccount } from "../accounts";
import { createHarness, SYSTEM_SOURCE, ADMIN_SOURCE, type TestHarness } from "./testUtils.test";
```

## Test Structure
Use `describe` blocks per pipeline step. Each test creates its own harness via `createHarness()`, seeds accounts via `getOrCreateCashAccount` inside `t.run`, then calls `postCashEntryInternal` inside the same `t.run` block.

## Key Patterns from Existing Tests
- Create accounts via `getOrCreateCashAccount(ctx, { family: "...", subaccount?: "..." })`
- Seed journal entries directly via `ctx.db.insert("cash_ledger_journal_entries", { ... })` for causedBy references
- Pre-set account balances via `ctx.db.patch(accountId, { cumulativeDebits: 100_000n })`
- Use regex patterns for error matching: `await expect(...).rejects.toThrow(/pattern/)`

## Drift Notes
- CORRECTION checks `source.actorType !== "admin"` (not `source.type === "user"` as spec says)
- SUSPENSE_ESCALATED skips balance checks (like REVERSAL/CORRECTION)
- 11 entry types total (SUSPENSE_ESCALATED is the 11th, not in original spec)
