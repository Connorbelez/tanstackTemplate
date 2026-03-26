# Chunk 03 Context: Tests

## Overview
Write tests for the webhook infrastructure. Tests cover: signature verification, core reversal logic (handleReversal + processReversal), and provider-specific webhook handlers.

---

## Test Framework & Patterns

### Test framework: Vitest
```typescript
import { describe, expect, it, vi } from "vitest";
```

### For Convex function tests: convex-test
```typescript
import { convexTest } from "convex-test";
import schema from "../../../schema";
```

### Project conventions:
- Test files in `__tests__/` directory alongside source
- Use `describe/it/expect` from vitest
- Use `convexTest(schema, modules)` for integration tests with Convex DB
- Use `vi.fn()` for mocks
- Follow existing test patterns in `convex/payments/cashLedger/__tests__/`

---

## T-008: Core Reversal Logic Tests

**File:** `convex/payments/webhooks/__tests__/handleReversal.test.ts` (new)

### Test categories:

#### Signature Verification Tests
```typescript
describe("verifyRotessaSignature", () => {
  it("returns true for valid HMAC-SHA256 signature");
  it("returns false for invalid signature");
  it("returns false for empty signature");
  it("is resistant to timing attacks (uses constant-time comparison)");
});

describe("verifyStripeSignature", () => {
  it("returns true for valid stripe-signature header");
  it("returns false for invalid signature");
  it("returns false for expired timestamp beyond tolerance");
  it("handles missing v1= prefix gracefully");
});
```

#### Core Reversal Logic Tests (using convex-test)
```typescript
describe("handlePaymentReversal", () => {
  // Happy path
  it("processes reversal for confirmed attempt: transitions to reversed + posts cash ledger entries");

  // Idempotency
  it("returns success for already-reversed attempt (idempotent skip)");
  it("duplicate webhook with same providerEventId is a no-op");

  // Out-of-order handling
  it("returns failure for non-confirmed attempt (out-of-order webhook)");
  it("returns failure for attempt in 'executing' state");

  // Not found
  it("returns failure when providerRef doesn't match any attempt");

  // Clawback
  it("flags clawbackRequired when payout was already sent");
});
```

#### processReversalCascade Tests
```typescript
describe("processReversalCascade", () => {
  it("calls postPaymentReversalCascade with correct arguments");
  it("calls executeTransition with PAYMENT_REVERSED event");
  it("passes effectiveDate and reason through to GT transition payload");
  it("logs warning when clawbackRequired is true");
});
```

### Test setup pattern for Convex integration tests:
```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../../schema";

// Import the modules under test
const modules = import.meta.glob("../../../**/*.ts", { eager: true });

describe("handlePaymentReversal", () => {
  it("happy path", async () => {
    const t = convexTest(schema, modules);

    // Seed test data:
    // 1. Create a mortgage
    // 2. Create an obligation
    // 3. Create a plan entry with obligationIds
    // 4. Create a collection attempt in "confirmed" state with a providerRef
    // 5. Create cash ledger accounts and CASH_RECEIVED entry (so reversal has something to reverse)

    // Call the handler
    // Assert: attempt transitioned to "reversed"
    // Assert: REVERSAL entries exist in cash_ledger_journal_entries
    // Assert: postingGroupId matches expected pattern
  });
});
```

### e2e helper patterns:
Look at `convex/payments/cashLedger/__tests__/e2eHelpers.ts` for existing test data seeding helpers. Reuse those where possible:
- `seedMortgage()`, `seedObligation()`, `seedCollectionAttempt()` etc.
- `seedCashLedgerAccounts()` for setting up the account chart

---

## T-009: Rotessa Webhook Handler Tests

**File:** `convex/payments/webhooks/__tests__/rotessaWebhook.test.ts` (new)

### Test categories:

```typescript
describe("rotessaWebhook", () => {
  // Signature validation
  it("returns 401 for invalid signature");
  it("returns 500 when ROTESSA_WEBHOOK_SECRET is not configured");

  // Event filtering
  it("returns 200 with ignored=true for non-reversal events");
  it("processes transaction.nsf event as reversal");
  it("processes transaction.returned event as reversal");
  it("processes transaction.reversed event as reversal");

  // Payload parsing
  it("returns 400 for invalid JSON body");
  it("correctly maps Rotessa amount (dollars) to cents");
  it("extracts providerRef from transaction_id");

  // Integration
  it("calls handlePaymentReversal with normalized payload");
  it("always returns 200 even when reversal processing fails (prevent retry storms)");
});
```

### Testing HTTP actions:
Rotessa/Stripe handlers are httpActions. To test them:
1. Unit test the payload mapping/parsing functions directly (no Convex needed)
2. Integration test the full handler via convex-test HTTP endpoint testing or by testing the internal functions they call

For signature verification unit tests, create known HMAC signatures:
```typescript
import { createHmac } from "node:crypto";

function createTestRotessaSignature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}
```

---

## T-010: Stripe Webhook Handler Tests

**File:** `convex/payments/webhooks/__tests__/stripeWebhook.test.ts` (new)

### Test categories:

```typescript
describe("stripeWebhook", () => {
  // Signature validation
  it("returns 401 for invalid stripe-signature");
  it("returns 500 when STRIPE_WEBHOOK_SECRET is not configured");

  // Event filtering
  it("returns 200 with ignored=true for non-reversal events");
  it("processes charge.refunded event");
  it("processes charge.dispute.created event with dispute warning log");
  it("processes payment_intent.payment_failed event");

  // Payload mapping
  it("extracts providerRef from metadata.provider_ref");
  it("falls back to charge ID when metadata missing");
  it("converts Stripe timestamp to YYYY-MM-DD date");
  it("maps failure_code to reversalCode");

  // Dispute-specific behavior (Foot Gun P4)
  it("logs warning for dispute events");
  it("processes dispute as reversal (freeze + flag is ENG-180 scope)");

  // Integration
  it("always returns 200 to prevent retry storms");
});
```

### Stripe signature test helper:
```typescript
import { createHmac } from "node:crypto";

function createTestStripeSignature(body: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${body}`;
  const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${ts},v1=${signature}`;
}
```

---

## Test Coverage Requirements (from Acceptance Criteria)

1. **Both Rotessa and Stripe reversal webhooks handled** — T-009, T-010
2. **Collection attempt transitions to reversed** — T-008 happy path
3. **Cash ledger reversal entries posted** — T-008 happy path
4. **Idempotent on duplicate webhooks** — T-008 idempotency tests
5. **Out-of-order webhooks handled gracefully** — T-008 out-of-order tests

## Edge Case Coverage (from Foot Gun Registry)

| Edge Case | Test | File |
|-----------|------|------|
| Already reversed → idempotent skip | T-008 | handleReversal.test.ts |
| Reversal after payout → clawback | T-008 | handleReversal.test.ts |
| NSF retry storm → dedup | T-008 | handleReversal.test.ts |
| Stripe dispute → flag obligation | T-010 | stripeWebhook.test.ts |
| Out-of-order → status check | T-008 | handleReversal.test.ts |
| Invalid signature → 401 | T-009, T-010 | both |
| Unknown event type → 200 ignore | T-009, T-010 | both |
