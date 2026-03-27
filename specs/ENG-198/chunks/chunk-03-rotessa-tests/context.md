# Chunk 3 Context: Rotessa PAD Skeleton and Tests

## Scope
Add the transfer-domain Rotessa PAD route required by ENG-198 without breaking the existing reversal-only Rotessa webhook behavior, then finish the issue with focused test coverage and the repo quality gate.

## Verbatim Design Context
From the ENG-198 Notion implementation plan:

### Step 5: Create Rotessa PAD skeleton handler
- **File(s):** `convex/payments/webhooks/rotessaPad.ts` (Create)
- **Action:** Skeleton handler mirroring VoPay pattern but with:
  - Signature verification using `verifyRotessaSignature`
  - `providerCode: "pad_rotessa"`
  - Placeholder status mapping (to be finalized in Phase 4)

### Step 6: Register Rotessa PAD route in http.ts
- **File(s):** `convex/http.ts`
- **Action:** Add `http.route({ path: "/webhooks/pad_rotessa", method: "POST", handler: rotessaPadWebhook })`

### Step 7: Write/extend webhook tests
- **File(s):** `convex/payments/webhooks/__tests__/vopayWebhook.test.ts` (extend), `convex/payments/webhooks/__tests__/eftVopayWebhook.test.ts` (Create)
- **Action:** Test cases:
  1. Valid signature → 200 + event persisted + transfer transitioned
  2. Invalid signature → 401
  3. Duplicate webhook → silently acknowledged, no duplicate transition
  4. Transfer already in target state → idempotent skip
  5. Unknown provider ref → logged warning, no crash
  6. Processing failure → raw event marked `"failed"`, still returns accepted
  7. EFT handler: outbound transfer settlement via FUNDS_SETTLED

From the ENG-198 Drift Report:
- **Missing** `/webhooks/pad_rotessa` Route: Issue requires `POST /webhooks/pad_rotessa` (skeleton for Phase 4), but the existing route is `POST /webhooks/rotessa` and the handler uses the old collection attempt path, not the transfer domain.
- **Recommendation:** For Phase 1, add a skeleton `/webhooks/pad_rotessa` route that mirrors the VoPay pattern but with `providerCode: "pad_rotessa"`. Keep existing `/webhooks/rotessa` for backward compatibility.

## Downstream Contract
ENG-211 expects:

1. Rotessa PAD adapter implementing TransferProvider interface
2. Rotessa API integration (authentication, request formatting)
3. Rotessa-specific error code → normalized error mapping
4. Rotessa webhook signature verification (custom format)
5. Register capabilities for all inbound collection transfer types

Acceptance Criteria:
- Implements same TransferProvider interface as VoPay — zero changes to state machine or ledger (REQ-256)
- All Rotessa-specific logic encapsulated within provider file
- Webhook handler registered at `/webhooks/pad_rotessa`
- Can be enabled/disabled via Provider Registry configuration

## Current Repo Constraints
- `convex/payments/webhooks/rotessa.ts` currently handles only reversal-style collection-attempt flows through `handlePaymentReversal()`.
- `convex/payments/webhooks/rotessa.ts` recognizes:
  - `transaction.nsf`
  - `transaction.returned`
  - `transaction.reversed`
- `convex/payments/webhooks/verification.ts` already has `verifyRotessaSignatureAction`.
- Existing tests already cover the reversal route:
  - `convex/payments/webhooks/__tests__/rotessaWebhook.test.ts`
  - `convex/payments/webhooks/__tests__/reversalIntegration.test.ts`
- Existing VoPay tests are mostly pure/unit-level today in `convex/payments/webhooks/__tests__/vopayWebhook.test.ts`; this issue needs stronger transfer-webhook coverage around durable persistence and idempotent processing.

## Test Constraints
- The Notion implementation plan explicitly notes: `httpActions cannot be tested with convex-test directly — webhook HTTP handlers need to be tested via the internal mutations they call`.
- Prefer testing:
  - shared persistence helpers
  - provider status mapping functions
  - internal processing mutations
  - route registration effects indirectly through exported handlers and internal mutations

## File Structure
- `convex/payments/webhooks/rotessa.ts`
- `convex/payments/webhooks/rotessaPad.ts` (new)
- `convex/payments/webhooks/__tests__/vopayWebhook.test.ts`
- `convex/payments/webhooks/__tests__/rotessaWebhook.test.ts`
- `convex/payments/webhooks/__tests__/eftVopayWebhook.test.ts` (new)
- `convex/http.ts`
