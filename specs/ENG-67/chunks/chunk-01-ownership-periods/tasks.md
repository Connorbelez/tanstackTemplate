# Chunk 01: Ownership Period Reconstruction

- [x] T-001: Align `convex/accrual/types.ts` with the ledger’s actual identifier conventions so accrual code uses `lenderId` consistently and can bridge mortgage `Id<"mortgages">` values to ledger string keys without unsafe casts leaking through the API.
- [x] T-002: Create `convex/accrual/ownershipPeriods.ts` with `getOwnershipPeriods()` that finds the lender POSITION account, merges debit and credit journal history, skips audit-only entries, sorts deterministically by `sequenceNumber`, and emits inclusive ownership periods with closing date accruing to the seller.
- [x] T-003: Create `convex/accrual/__tests__/ownershipPeriods.test.ts` covering mint/issue, mid-period transfer, full exit, audit-only entries, and deterministic period reconstruction from real ledger rows.
- [x] T-004: Create `convex/accrual/__tests__/proration.test.ts` covering the seller-closing-date rule and verifying split-owner accrual sums match the equivalent single-owner accrual for the same date range.
