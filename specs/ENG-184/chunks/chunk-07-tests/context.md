# Chunk 7 Context: Tests & Verification

## Goal
Full test coverage for the transfer domain: machine transitions, mutations, bridge, reconciliation. Verify zero regression on existing tests.

---

## T-025: Transfer Machine Tests

**File:** `convex/engine/machines/__tests__/transfer.machine.test.ts`

Follow the existing machine test pattern. Import the machine and use XState v5's `getNextSnapshot()` for pure state computation.

**Required test cases:**

### Happy paths
1. `initiated → pending` via PROVIDER_INITIATED
2. `pending → processing` via PROCESSING_UPDATE
3. `processing → confirmed` via FUNDS_SETTLED
4. `initiated → confirmed` via FUNDS_SETTLED (immediate shortcut for manual)
5. `confirmed → reversed` via TRANSFER_REVERSED
6. `initiated → cancelled` via TRANSFER_CANCELLED

### Failure paths
7. `pending → failed` via TRANSFER_FAILED
8. `processing → failed` via TRANSFER_FAILED

### Self-loop
9. `pending → pending` via PROVIDER_ACKNOWLEDGED (no state change)

### Terminal states
10. `failed` is final — no events accepted
11. `cancelled` is final — no events accepted
12. `reversed` is final — no events accepted

### Guard/action verification
13. FUNDS_SETTLED triggers `publishTransferConfirmed` action
14. TRANSFER_FAILED triggers `publishTransferFailed` action
15. TRANSFER_REVERSED triggers `publishTransferReversed` action
16. PROVIDER_INITIATED triggers `recordTransferProviderRef` action

### Invalid transitions
17. `confirmed` rejects all events except TRANSFER_REVERSED
18. `initiated` rejects PROCESSING_UPDATE (must go through pending first)

**Pattern from existing tests:**
```typescript
import { describe, expect, it } from "vitest";
import { getNextSnapshot } from "xstate";
import { transferMachine } from "../transfer.machine";

describe("transfer machine", () => {
  it("transitions from initiated to pending on PROVIDER_INITIATED", () => {
    const snapshot = transferMachine.resolveState({ value: "initiated", context: { transferId: "t1", providerRef: "", retryCount: 0 } });
    const next = getNextSnapshot(transferMachine, snapshot, { type: "PROVIDER_INITIATED", providerRef: "ref-123" });
    expect(next.value).toBe("pending");
  });
});
```

---

## T-026: Mutation Tests

**File:** `convex/payments/transfers/__tests__/mutations.test.ts`

Use `convex-test` for testing Convex mutations.

### Test cases:
1. `createTransferRequest` creates a record with status 'initiated'
2. `createTransferRequest` with same idempotencyKey returns existing ID (dedup)
3. `createTransferRequest` validates amount is positive integer
4. `createTransferRequest` validates direction matches transfer type
5. `initiateTransfer` with manual provider transitions to 'confirmed'
6. `initiateTransfer` on non-initiated transfer throws error

---

## T-027: Bridge Tests

**File:** `convex/payments/transfers/__tests__/bridge.test.ts`

### Test cases:
1. Collection attempt FUNDS_SETTLED creates parallel transfer record
2. Parallel transfer has `collectionAttemptId` set (marks it as bridged)
3. Parallel transfer has `status: 'confirmed'` (already settled)
4. Parallel transfer has correct `idempotencyKey` pattern
5. Existing cash posting via `postCashReceiptForObligation()` is unchanged
6. Duplicate FUNDS_SETTLED doesn't create duplicate transfer (idempotency)

---

## T-028: Reconciliation Tests

**File:** `convex/payments/transfers/__tests__/reconciliation.test.ts`

### Test cases:
1. Orphaned confirmed transfer (no journal entry, older than 5 min) is detected
2. Fresh confirmed transfer (less than 5 min old) is NOT flagged
3. Confirmed transfer WITH journal entry is NOT flagged
4. Self-healing retries up to 3 times
5. After 3 failed attempts, status escalates to `"escalated"`
6. Bridged transfers (with `collectionAttemptId`) are correctly handled — they have journal entries via the attempt path, not the transfer path
7. Resolved healing attempts are not retried

---

## T-029: Regression Verification

Run the existing collection attempt test suite:
```bash
bun run test -- --grep "collectionAttempt"
```

Verify ALL existing tests pass. The bridge modification (T-019) adds code AFTER existing logic — it should not break anything.

If any test fails, investigate and fix WITHOUT changing the test expectations. The existing behavior is the contract.

---

## T-030: Final Quality Gate

```bash
bunx convex codegen   # Schema compiles
bun check             # Lint/format pass (Biome)
bun typecheck         # TypeScript type checking
bun run test          # All tests pass
```

All four commands must pass cleanly.
