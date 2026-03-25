# ENG-151: Unit & Integration Tests for Posting Pipeline Invariants

## Master Task List

### Chunk 1: Shared Test Utilities ✅
- [x] T-001: Create `testUtils.test.ts` with shared constants (SYSTEM_SOURCE, ADMIN_SOURCE, ADMIN_IDENTITY)
- [x] T-002: Implement `createHarness()` factory and type export
- [x] T-003: Implement `seedMinimalEntities()` — seeds mortgage, lender, borrower, obligation for testing
- [x] T-004: Implement `createTestAccount()` — creates cash_ledger_accounts by family with optional subaccount
- [x] T-005: Implement `postTestEntry()` — convenience wrapper around postCashEntryInternal for tests

### Chunk 2: Pipeline Step Unit Tests (postEntry.test.ts) ✅
- [x] T-006: VALIDATE_INPUT tests — zero amount, negative amount, non-integer, MAX_SAFE_INTEGER, debit===credit, invalid date, valid positive (7 tests)
- [x] T-007: IDEMPOTENCY tests — duplicate key returns existing, no second entry, no balance update on duplicate, different keys create separate (4 tests)
- [x] T-008: FAMILY_CHECK tests — valid/invalid family combos, REVERSAL/CORRECTION accept any family (5 tests)
- [x] T-009: BALANCE_CHECK tests — rejects negative for non-exempt, allows CONTROL negative, allows BORROWER_RECEIVABLE negative, skips for REVERSAL/CORRECTION/SUSPENSE_ESCALATED (7 tests)
- [x] T-010: CONSTRAINT_CHECK tests — representative REVERSAL + CORRECTION tests (2 tests)
- [x] T-011: SEQUENCE+PERSIST tests — monotonic sequence, cumulative updates, cross-refs, projected balances (6 tests)
- [x] T-012: Cents integrity tests — bigint storage, no floating point (4 tests)

### Chunk 3: Entry Type Coverage Tests (entryTypes.test.ts) ✅
- [x] T-013: Post valid entries for all 11 entry types with correct account families (11 tests)
- [x] T-014: Entry type rejection tests — invalid family combos for constrained entry types (11 tests)
- [x] T-015: SUSPENSE_ESCALATED-specific tests — correct families, balance exemption (4 tests)

### Chunk 4: Financial Invariant Tests (financialInvariants.test.ts) ✅
- [x] T-016: CONTROL:ALLOCATION net-zero per posting group (3 tests)
- [x] T-017: Non-negative LENDER_PAYABLE (2 tests)
- [x] T-018: Point-in-time reconstruction matches running balances (3 tests)
- [x] T-019: Idempotent replay (2 tests)
- [x] T-020: Append-only correction (2 tests)
- [x] T-021: Reversal traceability (4 tests)

### Chunk 5: Existing Test Modifications + Final Verification ✅
- [x] T-022: Add to integration.test.ts — zero-amount, negative-amount, debit===credit rejection (3 tests)
- [x] T-023: Add to constraintsAndBalanceExemption.test.ts — SUSPENSE_ESCALATED balance exemption (1 test)
- [x] T-024: Quality gates pass (`bun check`, `bun typecheck`, `bun run test`)
- [x] T-025: No `any` types, no floating-point in monetary assertions
