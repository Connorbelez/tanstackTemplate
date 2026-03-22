# Chunk 01 Context: Remaining Queries & Middleware

## Overview
ENG-148 already built the majority of cash ledger query functions. This chunk fills the remaining gaps required by the ENG-150 acceptance criteria.

## Files to Modify
1. `convex/fluent.ts` — Add cashLedgerQuery and cashLedgerMutation middleware
2. `convex/payments/cashLedger/queries.ts` — Migrate to cashLedgerQuery, add new query functions

## Existing Code Patterns

### Fluent middleware pattern (from convex/fluent.ts)
```typescript
// Ownership ledger (line 394)
export const ledgerQuery = authedQuery.use(requirePermission("ledger:view"));
export const ledgerMutation = authedMutation.use(requirePermission("ledger:correct"));
```

Dispersal module (convex/dispersal/queries.ts:7):
```typescript
const dispersalQuery = authedQuery.use(requirePermission("dispersal:view"));
```

### Current cash ledger queries (convex/payments/cashLedger/queries.ts)
Currently uses `ledgerQuery` from fluent.ts. Must be migrated to `cashLedgerQuery`.

Existing query functions (all implemented):
- `getAccountBalance(accountId)` — reads account doc, returns getCashAccountBalance
- `getObligationBalance(obligationId)` — finds BORROWER_RECEIVABLE account + reconciliation
- `getMortgageCashState(mortgageId)` — aggregates all accounts by family
- `getLenderPayableBalance(lenderId)` — sums LENDER_PAYABLE accounts
- `getUnappliedCash()` — all UNAPPLIED_CASH with balance > 0
- `getSuspenseItems()` — all SUSPENSE with balance > 0
- `getAccountBalanceAt(accountId, asOf)` — historical using by_debit/credit_account_and_timestamp indexes
- `getObligationHistory(obligationId)` — full posting history via by_obligation_and_sequence

### Balance computation (convex/payments/cashLedger/accounts.ts)
```typescript
export function getCashAccountBalance(account): bigint {
  return isCreditNormalFamily(account.family)
    ? account.cumulativeCredits - account.cumulativeDebits
    : account.cumulativeDebits - account.cumulativeCredits;
}

export function isCreditNormalFamily(family: CashAccountFamily) {
  return CREDIT_NORMAL_FAMILIES.has(family);
}
```

Credit-normal families: LENDER_PAYABLE, SERVICING_REVENUE (from types.ts:121-124)

### Schema indexes available (convex/schema.ts)
cash_ledger_accounts:
- by_family: [family]
- by_mortgage: [mortgageId]
- by_obligation: [obligationId]
- by_lender: [lenderId]
- by_borrower: [borrowerId]
- by_family_and_mortgage: [family, mortgageId]
- by_family_and_obligation: [family, obligationId]
- by_family_and_lender: [family, lenderId]
- by_family_and_mortgage_and_lender: [family, mortgageId, lenderId]
- by_family_and_subaccount: [family, subaccount]

cash_ledger_journal_entries:
- by_sequence: [sequenceNumber]
- by_idempotency: [idempotencyKey]
- by_mortgage_and_sequence: [mortgageId, sequenceNumber]
- by_obligation_and_sequence: [obligationId, sequenceNumber]
- by_lender_and_sequence: [lenderId, sequenceNumber]
- by_debit_account_and_timestamp: [debitAccountId, timestamp]
- by_credit_account_and_timestamp: [creditAccountId, timestamp]
- by_posting_group: [postingGroupId, sequenceNumber]
- by_caused_by: [causedBy]
- by_effective_date: [effectiveDate, sequenceNumber]

### Types (convex/payments/cashLedger/types.ts)
```typescript
export type CashAccountFamily = "BORROWER_RECEIVABLE" | "CASH_CLEARING" | "TRUST_CASH" | "UNAPPLIED_CASH" | "LENDER_PAYABLE" | "SERVICING_REVENUE" | "WRITE_OFF" | "SUSPENSE" | "CONTROL";
export type CashEntryType = "OBLIGATION_ACCRUED" | "CASH_RECEIVED" | "CASH_APPLIED" | "LENDER_PAYABLE_CREATED" | "SERVICING_FEE_RECOGNIZED" | "LENDER_PAYOUT_SENT" | "OBLIGATION_WAIVED" | "OBLIGATION_WRITTEN_OFF" | "REVERSAL" | "CORRECTION" | "SUSPENSE_ESCALATED";
export type ControlSubaccount = "ACCRUAL" | "ALLOCATION" | "SETTLEMENT" | "WAIVER";
```

### Internal query pattern (from reconciliation.ts)
```typescript
export const getJournalSettledAmountForObligationInternal = internalQuery({
  args: { obligationId: v.id("obligations") },
  handler: async (ctx, { obligationId }) => {
    const amount = await getJournalSettledAmountForObligation(ctx, obligationId);
    return Number(amount);
  },
});
```
Note: Returns `number` (not `bigint`) since bigint cannot be passed across Convex function boundaries via ctx.runQuery.

### Existing getAccountBalanceAt logic (queries.ts:132-176)
Uses `by_debit_account_and_timestamp` and `by_credit_account_and_timestamp` indexes.
Replays entries in sequenceNumber order. Starts at 0n. Family-aware sign convention.
Filters by timestamp <= asOf using index range query.

## Acceptance Criteria (from ENG-150)
- All query functions return correct balances from journal entries
- Two independent replay processes produce identical results for same query
- Point-in-time queries support mortgage, obligation, lender, borrower, account family dimensions
- Date range queries with opening and closing balances
- Zero entries before timestamp returns zero balances

## Design Constraints
- **REQ-243**: sequenceNumber is canonical replay ordering, not timestamp
- **REQ-248**: All amounts are bigint cents (safe integers). No floating-point.
- **Read-only**: All queries are pure reads. MUST NOT modify state.
- **Append-only respect**: Never assume entries can be mutated.
- **Pattern mirror**: Follow existing query patterns in the same file.
- **Internal variants return number**: bigint cannot cross Convex function boundaries.
- **No ownership ledger changes**: Zero modifications to convex/ledger/* files.

## Implementation Plan Excerpts

### getAccountBalanceRange (Step 6 from plan)
Returns opening balance (at fromDate), closing balance (at toDate), and all entries in range.
- Fetch ALL entries for the account (both debit and credit sides)
- Deduplicate entries that appear on both sides (an entry where the account is BOTH debit and credit is impossible by validation, but entries appear in both index scans)
- Sort by sequenceNumber
- Compute opening balance from entries with effectiveDate < fromDate
- Collect entries with effectiveDate in [fromDate, toDate]
- Compute closing balance = opening + sum of in-range deltas
- Apply family-aware sign convention

### getBorrowerBalance (Step 7b from plan)
All receivables across all obligations for a borrower.
- Query cash_ledger_accounts with by_borrower index for the borrowerId
- Filter for family === "BORROWER_RECEIVABLE"
- Sum balances, return total + per-obligation breakdown

### getBalancesByFamily (Step 7a from plan)
Aggregate balances by account family, optionally filtered by mortgage and point-in-time.
- If mortgageId: use by_mortgage index
- If no mortgageId: query all accounts (no efficient way without scanning)
- Group by family, sum getCashAccountBalance for each
- If asOf provided: replay entries for each account up to asOf timestamp
  NOTE: Point-in-time for all accounts is expensive. For Phase 1, only support asOf with mortgageId filter.

## Downstream Consumers (why internal variants matter)
- ENG-164 (reconciliation) needs: getObligationBalance, getLenderPayableBalance, getUnappliedCash, getSuspenseItems
- ENG-183 (disbursement gate) needs: getLenderPayableBalance
- ENG-171 (replay integrity) needs: getAccountBalanceAt, getObligationHistory
These are all server-side callers that use ctx.runQuery — they need internalQuery variants.
