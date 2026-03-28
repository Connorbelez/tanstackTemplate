# ENG-205: Add Pre-Transfer Bank Account Validation Gate

## Master Task List

### Chunk 01: Schema & Types ✅
- [x] T-001: Add `bankAccounts` table to `convex/schema.ts`
- [x] T-002: Create `convex/payments/bankAccounts/types.ts` — status enums, validation result, provider helpers
- [x] T-003: Add `requiresBankAccountValidation()` and `isPadProvider()` helpers to types

### Chunk 02: Validation & Queries ✅
- [x] T-004: Create `convex/payments/bankAccounts/validation.ts` — `validateBankAccountForTransfer()` pure logic + internalQuery
- [x] T-005: Create `convex/payments/bankAccounts/queries.ts` — `listBankAccountsByOwner` using `by_owner` index

### Chunk 03: Integration & Seed ✅
- [x] T-006: Wire validation gate into `initiateTransfer` action (public, RBAC-gated)
- [x] T-007: Wire validation gate into `initiateTransferInternal` action (system pipeline)
- [x] T-008: Create `convex/payments/bankAccounts/mutations.ts` — admin `seedBankAccount` mutation

### Chunk 04: Tests ✅
- [x] T-009: Write unit tests for validation logic (38 tests passing)
- [x] T-010: Write unit tests for provider-code helpers (requiresBankAccountValidation, isPadProvider)
