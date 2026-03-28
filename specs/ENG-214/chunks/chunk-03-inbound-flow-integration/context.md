# Chunk 3 Context: Inbound Collection Flow Integration Tests

## Goal
Test the full inbound collection pipeline end-to-end: from collection plan entry execution through collection attempt, bridge transfer creation, obligation settlement, and verify the D4 conditional correctly skips/posts cash ledger entries.

## Architecture: Three-Layer Payment System

```
Layer 1: Obligations (what is owed)
  → obligations table, governed entity, PAYMENT_APPLIED event

Layer 2: Collection Plan (how we intend to collect)
  → collectionPlanEntries table, scheduling logic
  → Creates collection attempts when entries are due

Layer 3: Collection Attempts (what actually happened)
  → collectionAttempts table, governed entity
  → On FUNDS_SETTLED → emitPaymentReceived effect
    → Applies payment to obligations
    → Creates bridge transfer record (Phase M2a)
```

## Bridge Flow (Phase M2a: Parallel Records)

**File:** `convex/engine/effects/collectionAttempt.ts` — `emitPaymentReceived`

1. Collection attempt reaches `confirmed` state (FUNDS_SETTLED event)
2. `emitPaymentReceived` effect fires:
   a. Looks up collection plan entry and its obligations
   b. Applies PAYMENT_APPLIED to each obligation (unchanged from pre-transfer logic)
   c. Calls `postCashReceiptForObligation()` (existing cash posting — UNCHANGED)
   d. Creates a bridge `transferRequest` record with:
      - `status: "confirmed"` (created already confirmed)
      - `direction: "inbound"`
      - `transferType: "borrower_interest_collection"` (FIXME: currently hardcoded)
      - `collectionAttemptId: <attemptId>` (marks as bridged)
      - `idempotencyKey: "transfer:bridge:<attemptId>"`
   e. Fires FUNDS_SETTLED on the bridge transfer via `executeTransition()`
   f. `publishTransferConfirmed` effect fires → sees `collectionAttemptId` → SKIPS cash posting (D4)

## D4 Conditional Logic

**File:** `convex/engine/effects/transfer.ts` — `publishTransferConfirmed`

```
if (transfer.collectionAttemptId) {
  // Bridged transfer — cash already posted via collection attempt path
  // Skip cash posting to prevent double-posting
  return;
}
if (transfer.direction === "inbound") {
  // Direct inbound transfer (not via bridge)
  postCashReceiptForTransfer(...)
}
if (transfer.direction === "outbound") {
  postLenderPayoutForTransfer(...)
}
```

## Manual Inbound Transfer (Non-Bridged)

When an admin creates an inbound transfer directly (not through collection attempt):
1. Create transfer via `createTransferRequest` mutation
2. Transfer starts at `initiated` state
3. `confirmManualTransfer` mutation fires FUNDS_SETTLED
4. `publishTransferConfirmed` sees NO `collectionAttemptId` → posts CASH_RECEIVED

This tests the non-D4 path.

## Test Setup Requirements

Use the established integration test patterns from `handlers.integration.test.ts`:

```typescript
const modules = import.meta.glob("/convex/**/*.ts");

function createHarness() {
  process.env.DISABLE_GT_HASHCHAIN = "true";
  const t = convexTest(schema, modules);
  auditLogTest.register(t, "auditLog");
  return t;
}
```

For the full inbound flow test (T-011), you need to seed:
1. Users (broker, borrower)
2. Borrower, Broker entities
3. Property, Mortgage
4. Obligation (regular_interest, status: "unpaid")
5. Collection plan entry linked to obligation
6. Collection attempt linked to plan entry

Then execute the collection attempt confirmation and verify:
- Obligation status changed to "settled" or "paid"
- Bridge transfer record exists with correct fields
- Cash ledger entry exists from the COLLECTION ATTEMPT path (not transfer)
- No DUPLICATE cash ledger entry from the transfer path

## Existing Entity Seeding

**File:** `convex/payments/cashLedger/__tests__/testUtils.ts`
```typescript
async function seedMinimalEntities(t) {
  // Creates: broker, borrower, 2 lenders, property, mortgage, ownership accounts
}
```

**File:** `convex/payments/transfers/__tests__/handlers.integration.test.ts`
```typescript
async function seedCoreEntities(t): Promise<{
  borrowerId, lenderId, mortgageId, dealAId, dealBId
}>
```

You may need to extend one of these helpers to also create obligations and collection plan entries.

## Schema References

### collectionPlanEntries
```
status, method, amount, dueDate, borrowerId, mortgageId, obligationId, ...
```

### collectionAttempts
```
status, machineContext, lastTransitionAt, planEntryId, amount, method, ...
```

### transferRequests (bridge fields)
```
collectionAttemptId, obligationId, planEntryId, mortgageId, counterpartyId, ...
```

## Test Output Files
- `convex/payments/transfers/__tests__/inboundFlow.integration.test.ts`

## Key Invariants to Verify
1. **Zero double-posting**: Bridge path must NOT create a second cash ledger entry
2. **Bridge record always created**: Every confirmed collection attempt → one bridge transfer
3. **Idempotency**: Running emitPaymentReceived twice → still only one bridge transfer
4. **Obligation state correct**: PAYMENT_APPLIED fired, obligation moves to settled/paid
5. **Non-bridged direct transfers DO post**: Manual transfers without collectionAttemptId → cash posting happens
