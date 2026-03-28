# Chunk 04 Context: Tests

## Goal
Write unit tests for the bank account validation logic and provider-code helpers.

## T-009: Validation logic tests

**File:** `convex/payments/bankAccounts/__tests__/validation.test.ts`

Follow the existing test pattern from `convex/payments/transfers/__tests__/mutations.test.ts` — pure unit tests for domain logic, no convex-test setup required.

**However:** The `validateBankAccountForTransfer` function is an `internalQuery`, not a pure function. For pure unit testing, we need to extract the validation logic into testable pure functions.

**Approach:** Create helper functions in `validation.ts` that are exported separately:
1. `checkBankAccountStatus(bankAccount, providerCode)` — pure function
2. `validateAccountFormat(institutionNumber, transitNumber)` — pure function

Then the `internalQuery` handler calls these. Tests exercise the pure functions directly.

**Alternatively:** Since the existing test pattern in this codebase tests pure logic extracted from mutations (see `mutations.test.ts` lines 45-80 testing `validateAmount` as a pure function), follow the same pattern.

### Test cases for T-009:

```typescript
import { describe, expect, it } from "vitest";
import {
  isPadProvider,
  requiresBankAccountValidation,
  type BankAccountValidationResult,
} from "../types";

// Test the pure validation helpers

describe("requiresBankAccountValidation", () => {
  it("returns true for pad_vopay", () => {
    expect(requiresBankAccountValidation("pad_vopay")).toBe(true);
  });
  it("returns true for pad_rotessa", () => {
    expect(requiresBankAccountValidation("pad_rotessa")).toBe(true);
  });
  it("returns true for eft_vopay", () => {
    expect(requiresBankAccountValidation("eft_vopay")).toBe(true);
  });
  it("returns true for mock_pad", () => {
    expect(requiresBankAccountValidation("mock_pad")).toBe(true);
  });
  it("returns true for mock_eft", () => {
    expect(requiresBankAccountValidation("mock_eft")).toBe(true);
  });
  it("returns false for manual", () => {
    expect(requiresBankAccountValidation("manual")).toBe(false);
  });
  it("returns false for e_transfer", () => {
    expect(requiresBankAccountValidation("e_transfer")).toBe(false);
  });
  it("returns false for wire", () => {
    expect(requiresBankAccountValidation("wire")).toBe(false);
  });
  it("returns false for plaid_transfer", () => {
    expect(requiresBankAccountValidation("plaid_transfer")).toBe(false);
  });
});

describe("isPadProvider", () => {
  it("returns true for pad_vopay", () => {
    expect(isPadProvider("pad_vopay")).toBe(true);
  });
  it("returns true for pad_rotessa", () => {
    expect(isPadProvider("pad_rotessa")).toBe(true);
  });
  it("returns true for mock_pad", () => {
    expect(isPadProvider("mock_pad")).toBe(true);
  });
  it("returns false for eft_vopay", () => {
    expect(isPadProvider("eft_vopay")).toBe(false);
  });
  it("returns false for mock_eft", () => {
    expect(isPadProvider("mock_eft")).toBe(false);
  });
  it("returns false for manual", () => {
    expect(isPadProvider("manual")).toBe(false);
  });
});
```

### Test cases for validation logic (pure functions):

```typescript
describe("validateBankAccountRecord", () => {
  // Test the pure validation function (not the internalQuery wrapper)

  it("returns BANK_ACCOUNT_NOT_VALIDATED when status is pending_validation", () => { ... });
  it("returns BANK_ACCOUNT_NOT_VALIDATED when status is revoked", () => { ... });
  it("returns BANK_ACCOUNT_NOT_VALIDATED when status is rejected", () => { ... });
  it("returns MANDATE_NOT_ACTIVE when PAD provider and mandate is revoked", () => { ... });
  it("returns MANDATE_NOT_ACTIVE when PAD provider and mandate is pending", () => { ... });
  it("passes validation for EFT provider even with non-active mandate", () => { ... });
  it("returns INVALID_ACCOUNT_FORMAT for bad institution number", () => { ... });
  it("returns INVALID_ACCOUNT_FORMAT for bad transit number", () => { ... });
  it("passes validation with correct format", () => { ... });
  it("passes validation when institution/transit are undefined (optional fields)", () => { ... });
});
```

## T-010: Provider-code helper tests

These are included in T-009's file since they test the same module's exports. The `requiresBankAccountValidation` and `isPadProvider` tests above cover this task.

## Existing Test Patterns

### From `convex/payments/transfers/__tests__/mutations.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
// ... imports of pure functions

describe("amount validation logic", () => {
  function validateAmount(amount: number): boolean {
    return Number.isInteger(amount) && amount > 0;
  }
  it("accepts a positive integer", () => {
    expect(validateAmount(100_000)).toBe(true);
  });
  // ...
});
```

### Test runner command:
```bash
bun run test convex/payments/bankAccounts/
```

### Biome rules to follow:
- Use top-level regex constants (biome/useTopLevelRegex) — define regex patterns outside test bodies
- Import `describe`, `expect`, `it` from "vitest"

## Validation
- All tests pass: `bun run test convex/payments/bankAccounts/`
- `bun check` passes (no lint errors)
