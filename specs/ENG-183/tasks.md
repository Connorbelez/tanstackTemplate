# ENG-183: Disbursement Pre-Validation Gate

## Tasks

- [x] T-001: Add `by_lender_and_status` index to `transferRequests` in schema.ts
- [x] T-002: Add `getAvailableLenderPayableBalance` public query to queries.ts
- [x] T-003: Add `internalGetAvailableLenderPayableBalance` internal query variant
- [x] T-004: Create `disbursementGate.ts` with `validateDisbursementAmount()` and `assertDisbursementAllowed()`
- [x] T-005: Create `disbursementGate.test.ts` with 8 test cases
- [x] T-006: Run quality gates (convex codegen, bun check, bun typecheck)
