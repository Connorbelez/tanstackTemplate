# Chunk 03 Context: Entry Type Coverage Tests

## Goal
Create `convex/payments/cashLedger/__tests__/entryTypes.test.ts` — integration tests posting all 11 entry types with valid accounts and testing rejection for invalid family combinations.

## File to Create
`convex/payments/cashLedger/__tests__/entryTypes.test.ts`

## All 11 Entry Types with Valid Family Combos
Each test must create the correct debit and credit accounts, then post an entry.

| Entry Type | Valid Debit Family | Valid Credit Family | Special |
|---|---|---|---|
| OBLIGATION_ACCRUED | BORROWER_RECEIVABLE | CONTROL (subaccount: ACCRUAL) | - |
| CASH_RECEIVED | TRUST_CASH or CASH_CLEARING or UNAPPLIED_CASH | BORROWER_RECEIVABLE | Test TRUST_CASH variant |
| CASH_APPLIED | CONTROL (SETTLEMENT) or UNAPPLIED_CASH | CONTROL or BORROWER_RECEIVABLE | Test UNAPPLIED→BORROWER variant |
| LENDER_PAYABLE_CREATED | CONTROL (ALLOCATION) | LENDER_PAYABLE | - |
| SERVICING_FEE_RECOGNIZED | CONTROL (ALLOCATION) | SERVICING_REVENUE | - |
| LENDER_PAYOUT_SENT | LENDER_PAYABLE | TRUST_CASH | Need LENDER_PAYABLE with credit balance, TRUST_CASH with debit balance |
| OBLIGATION_WAIVED | CONTROL (WAIVER) | BORROWER_RECEIVABLE | - |
| OBLIGATION_WRITTEN_OFF | WRITE_OFF | BORROWER_RECEIVABLE | - |
| REVERSAL | ANY | ANY | Requires causedBy |
| CORRECTION | ANY | ANY | Requires admin source, causedBy, reason |
| SUSPENSE_ESCALATED | SUSPENSE | BORROWER_RECEIVABLE | Skips balance check |

## Balance Setup Requirements
For non-exempt entry types, accounts may need pre-existing balances to avoid negative balance errors:
- LENDER_PAYOUT_SENT: debit LENDER_PAYABLE needs credit balance (credit-normal, so credits > debits)
- LENDER_PAYOUT_SENT: credit TRUST_CASH needs debit balance (debit-normal, so debits > credits)
- Other entry types credit BORROWER_RECEIVABLE or CONTROL (both exempt) so no pre-balance needed

Use `ctx.db.patch(accountId, { cumulativeDebits: Xn, cumulativeCredits: Yn })` to set initial balances.

## Rejection Tests
For each constrained entry type, test at least one invalid family. Examples:
- OBLIGATION_ACCRUED: debit TRUST_CASH (invalid — should only debit BORROWER_RECEIVABLE)
- CASH_RECEIVED: credit LENDER_PAYABLE (invalid — should only credit BORROWER_RECEIVABLE)
- LENDER_PAYOUT_SENT: debit TRUST_CASH (invalid — should only debit LENDER_PAYABLE)
- LENDER_PAYOUT_SENT: credit BORROWER_RECEIVABLE (invalid — should only credit TRUST_CASH)

Error pattern: `/{entryType} cannot (debit|credit) family {family}/`

## SUSPENSE_ESCALATED Tests
- Correct family combo: debit SUSPENSE, credit BORROWER_RECEIVABLE
- Balance exemption: SUSPENSE_ESCALATED skips balance check entirely, so even with 0 balance SUSPENSE account, the posting should succeed

## Import Pattern
```typescript
import { describe, expect, it } from "vitest";
import { postCashEntryInternal, type PostCashEntryInput } from "../postEntry";
import { getOrCreateCashAccount } from "../accounts";
import { createHarness, SYSTEM_SOURCE, ADMIN_SOURCE, type TestHarness } from "./testUtils.test";
```

## Key Note
REVERSAL and CORRECTION accept ALL_FAMILIES for both debit and credit — they cannot fail family check. They have constraint checks instead (causedBy, admin source, etc.).
