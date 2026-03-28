# Chunk 03 Context — Tests

## What You're Building

**File to create:** `convex/dispersal/__tests__/disbursementBridge.test.ts`

Unit + integration tests for the disbursement bridge. Tests use `convex-test` for integration testing (Convex's built-in test framework).

---

## Test Framework Pattern

Look at existing test files in the codebase for patterns. The key pattern:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

describe("disbursementBridge", () => {
  it("should do something", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      // Insert test data, call functions, assert results
    });
  });
});
```

**IMPORTANT:** Before writing tests, read existing test files to understand the exact convex-test patterns used in this project. Look at:
- `convex/payments/transfers/__tests__/bridge.test.ts` — transfer bridge tests (closest pattern)
- `convex/dispersal/__tests__/` — any existing dispersal tests
- `convex/payments/cashLedger/__tests__/` — cash ledger integration tests

Follow their exact patterns for:
- How to set up test fixtures (lenders, mortgages, obligations, dispersal entries)
- How to seed required related data
- How to call internal functions
- How to assert database state after mutations

---

## T-010: Unit Tests for Helper Functions

```typescript
describe("buildDisbursementIdempotencyKey", () => {
  it("produces deterministic key from dispersalEntryId", () => {
    // Test that the same ID always produces the same key
    // Test that different IDs produce different keys
  });
});
```

---

## T-011: Integration Test — Happy Path

The full lifecycle:

1. **Seed data:**
   - Create a lender record
   - Create a mortgage record
   - Create a dispersal entry: status "pending", payoutEligibleAfter in the past, amount: 5000

2. **Seed cash ledger balance:**
   - The lender must have LENDER_PAYABLE balance >= entry amount
   - This means there must be prior journal entries that credited LENDER_PAYABLE

3. **Run bridge:**
   - Call `triggerDisbursementBridge` with asOfDate = today

4. **Assert transfer created:**
   - Query transferRequests by dispersalEntryId
   - Assert: direction "outbound", transferType "lender_dispersal_payout", amount matches entry, status should be "initiated" or "confirmed" (depends on mock provider mode)

5. **Simulate confirmation (if async):**
   - If mock_eft is in async mode, simulate the webhook
   - Otherwise, immediate mode confirms at initiation

6. **Assert dispersal entry updated:**
   - Entry status = "disbursed"
   - Entry payoutDate set

7. **Assert cash ledger entry:**
   - Query cash_ledger_journal_entries by transferRequestId
   - Assert: entryType "LENDER_PAYOUT_SENT", debit LENDER_PAYABLE, credit TRUST_CASH

---

## T-012: Integration Test — Idempotency

1. Seed a pending dispersal entry
2. Run bridge once → transfer created
3. Run bridge again → no new transfer (idempotency key match)
4. Assert: still only 1 transfer for this dispersalEntryId

---

## T-013: Integration Test — Disbursement Gate

1. Seed a pending dispersal entry with amount: 10000
2. Seed LENDER_PAYABLE balance at only 5000 (less than entry amount)
3. Run bridge → should fail the disbursement gate
4. Assert: entry remains "pending", error returned in bridge result

---

## T-014: Integration Test — Failed Transfer

1. Seed a pending dispersal entry
2. Run bridge to create + initiate transfer
3. Simulate transfer failure (via mock provider fail mode or direct GT transition)
4. Assert: dispersal entry status = "failed"
5. Test resetFailedEntry: call it, assert entry back to "pending"
6. Run bridge again → new transfer created (entry is eligible again)

---

## T-015: Integration Test — ENG-219 Guard

1. Seed a dispersal entry with a specific amount (e.g., 7500)
2. Ensure the mortgage has a different current principal (proving the entry was computed at creation time with a historical snapshot)
3. Run bridge → transfer created
4. Assert: transfer.amount === 7500 (entry amount, NOT recomputed from current principal)

This test is more of a documentation test — it proves the bridge passes through the entry amount rather than calling any calculation function.

---

## Key Imports for Tests

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../_generated/api";
import schema from "../../schema";
import { buildDisbursementIdempotencyKey } from "../disbursementBridge";
```

---

## Mock Provider Configuration

The `mock_eft` provider needs `ENABLE_MOCK_PROVIDERS="true"` environment variable. In tests, this should be set via the test environment or the mock provider's configuration.

Check how existing transfer tests handle this — look at `convex/payments/transfers/__tests__/` for the pattern.

---

## Constraints

- Tests must be self-contained — seed all required data within each test.
- Follow existing test file naming: `__tests__/disbursementBridge.test.ts`
- Use `convex-test` patterns from the existing codebase (NOT generic Vitest patterns).
- The bridge is an `internalAction` — call via `t.action(internal.dispersal.disbursementBridge.triggerDisbursementBridge, args)`.
- Cash ledger balance setup may require calling internal cash posting functions to seed LENDER_PAYABLE balance.
