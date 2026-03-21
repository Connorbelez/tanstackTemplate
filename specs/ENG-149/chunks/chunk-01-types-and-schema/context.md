# Chunk 01 Context: Types & Schema

## What Exists
- `convex/payments/cashLedger/types.ts` has `CONTROL_SUBACCOUNTS`, `ControlSubaccount`, `CashEntryType`, `CASH_ENTRY_TYPE_FAMILY_MAP`
- Schema has `subaccount` as top-level field on `cash_ledger_accounts` with `v.optional(v.union(v.literal("ACCRUAL"), v.literal("ALLOCATION"), v.literal("SETTLEMENT"), v.literal("WAIVER")))`
- Schema has indexes: `by_family`, `by_family_and_mortgage`, `by_family_and_obligation`, `by_family_and_lender`, `by_family_and_mortgage_and_lender` but NO `by_family_and_subaccount`

## What's Missing

### T-001: ENTRY_TYPE_CONTROL_SUBACCOUNT mapping
Add to `convex/payments/cashLedger/types.ts`:
```typescript
export const ENTRY_TYPE_CONTROL_SUBACCOUNT: Partial<Record<CashEntryType, ControlSubaccount>> = {
  OBLIGATION_ACCRUED: "ACCRUAL",
  CASH_APPLIED: "SETTLEMENT",
  LENDER_PAYABLE_CREATED: "ALLOCATION",
  SERVICING_FEE_RECOGNIZED: "ALLOCATION",
  OBLIGATION_WAIVED: "WAIVER",
};
```
This centralizes the mapping so downstream posting code doesn't hardcode subaccounts.

### T-002: TRANSIENT_SUBACCOUNTS set
Add to `convex/payments/cashLedger/types.ts`:
```typescript
export const TRANSIENT_SUBACCOUNTS: ReadonlySet<ControlSubaccount> = new Set([
  "ACCRUAL",
  "ALLOCATION",
  "SETTLEMENT",
]);
```
WAIVER is NOT transient — it's monotonically increasing. Only ACCRUAL, ALLOCATION, SETTLEMENT must net to zero per posting group.

### T-003: by_family_and_subaccount index
Add to `convex/schema.ts` on `cash_ledger_accounts`:
```typescript
.index("by_family_and_subaccount", ["family", "subaccount"])
```
This enables O(1) lookup for CONTROL accounts by subaccount instead of scanning all CONTROL accounts.

## File Paths
- `convex/payments/cashLedger/types.ts` — add ENTRY_TYPE_CONTROL_SUBACCOUNT and TRANSIENT_SUBACCOUNTS
- `convex/schema.ts` — add index (line ~959, after existing indexes on cash_ledger_accounts)
