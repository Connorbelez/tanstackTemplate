# Chunk 03 Context: Tests

## What Exists
- `convex/payments/cashLedger/__tests__/integration.test.ts` has 4 integration tests covering:
  - Obligation accrual for principal repayment
  - Cash receipts to TRUST_CASH and reconciliation drift detection
  - Lender payables and servicing revenue after settlement allocation
  - Lender payable balance guards for payout posting
- Tests use `convex-test` with `convexTest(schema, modules)`
- Test harness pattern: `createHarness()`, `seedCoreEntities()`, `createUpcomingObligation()`, `createSettledObligation()`
- SYSTEM_SOURCE = `{ channel: "scheduler", actorId: "system", actorType: "system" }`

## What's Missing
Create a new test file: `convex/payments/cashLedger/__tests__/controlSubaccounts.test.ts`

### Test Setup Pattern
```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../../schema";

const modules = import.meta.glob("/convex/**/*.ts");
const SYSTEM_SOURCE = { channel: "scheduler" as const, actorId: "system", actorType: "system" as const };

function createHarness() { return convexTest(schema, modules); }
```

### T-008: Test ENTRY_TYPE_CONTROL_SUBACCOUNT mapping correctness
Pure unit test — import the mapping and verify:
- OBLIGATION_ACCRUED → ACCRUAL
- CASH_APPLIED → SETTLEMENT
- LENDER_PAYABLE_CREATED → ALLOCATION
- SERVICING_FEE_RECOGNIZED → ALLOCATION
- OBLIGATION_WAIVED → WAIVER
- Entry types NOT in the map (CASH_RECEIVED, LENDER_PAYOUT_SENT, etc.) return undefined

### T-009: Test getControlAccountsBySubaccount
- Seed CONTROL accounts with different subaccounts (ACCRUAL, ALLOCATION)
- Call getControlAccountsBySubaccount with "ACCRUAL"
- Verify only ACCRUAL accounts returned

### T-010: Test getControlBalanceBySubaccount
- Seed CONTROL:ACCRUAL accounts with known cumulative debits/credits
- Call getControlBalanceBySubaccount
- Verify totalBalance and accountCount are correct

### T-011: Test validateControlNetZero for complete posting group
- Create a complete allocation posting group: post LENDER_PAYABLE_CREATED + SERVICING_FEE_RECOGNIZED
- Call validateControlNetZero with the postingGroupId
- Verify ALLOCATION balance is zero and valid is true
- Uses the same settled obligation + dispersal pattern as existing integration tests

### T-012: Test validateControlNetZero for incomplete posting group
- Create only LENDER_PAYABLE_CREATED entries (no servicing fee)
- Call validateControlNetZero
- Verify ALLOCATION has non-zero balance and valid is false

### T-013: Test WAIVER subaccount exempt from net-zero
- Post an OBLIGATION_WAIVED entry using CONTROL:WAIVER
- Call validateControlNetZero
- Verify WAIVER does NOT appear in results (only transient subaccounts are checked)

### T-014: Test CONTROL account creation requires subaccount
- Call getOrCreateCashAccount with family "CONTROL" and NO subaccount
- Verify it succeeds (subaccount is optional in schema) but account has undefined subaccount
- Call getOrCreateCashAccount with family "CONTROL" and subaccount "ACCRUAL"
- Verify account has subaccount "ACCRUAL"
- Verify they are DIFFERENT accounts (not matched)

## Key Imports
```typescript
import { ENTRY_TYPE_CONTROL_SUBACCOUNT, TRANSIENT_SUBACCOUNTS } from "../types";
import { getControlAccountsBySubaccount, getOrCreateCashAccount, getCashAccountBalance } from "../accounts";
import { getControlBalanceBySubaccount, validateControlNetZero } from "../reconciliation";
import { postCashEntryInternal } from "../postEntry";
import { postSettlementAllocation } from "../integrations";
```

## Existing Test Helpers (from integration.test.ts)
Use the same seedCoreEntities pattern but can simplify — many tests just need direct db.insert for accounts.
For T-011/T-012, use `createSettledObligation` + `createDispersalEntries` or post entries directly via `postCashEntryInternal`.

## File Path
- `convex/payments/cashLedger/__tests__/controlSubaccounts.test.ts`
