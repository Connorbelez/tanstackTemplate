# Chunk 1 Context: Schema and Shared Webhook Core

## Scope
Set up the shared transfer-domain webhook primitives before adding new routes. This chunk should leave the repo with a canonical persistence shape for transfer webhook events and a reusable core that later provider handlers can call without duplicating event insert/status/update/lookup logic.

## Verbatim Acceptance Criteria (ENG-198)
- Webhook handler returns 200 immediately, processes async (REQ-257)
- **transferWebhooks table deployed** — every webhook is durably stored before processing
- Duplicate webhooks are silently acknowledged — no duplicate state transitions or ledger entries
- Invalid signatures are rejected with 401
- Provider-specific status codes are mapped to normalized events inside provider boundary (REQ-262)
- Handler logs webhook receipt for monitoring
- Handler works for both inbound and outbound provider callbacks

## Linear Issue Context
From ENG-198:

1. **Signature verification** — HMAC-SHA256 for VoPay, custom for Rotessa. Reject unverified webhooks with 401.
2. **Immediate 200 response** — Return 200 before processing (matches existing WorkOS webhook pattern)
3. **Payload persistence** — Store raw webhook in `transferWebhooks` table for audit trail and replay
4. **Transfer lookup** — Find transfer by `providerCode + providerRef`
5. **Idempotency check** — If transfer already in target state, acknowledge silently
6. **State transition** — Schedule `sendCommand` mutation to fire appropriate event:
   * Settlement confirmed → `FUNDS_SETTLED`
   * Payment failed/NSF → `TRANSFER_FAILED`
   * Reversal/return → `TRANSFER_REVERSED`
7. **Status mapping** — Provider-specific status codes → normalized Transfer Lifecycle events

## Verbatim Design Context
From the ENG-198 Notion implementation plan:

1. **Table Naming:** The issue spec calls for `transferWebhooks` but the codebase already has `webhookEvents`. These serve the same purpose. No rename needed — `webhookEvents` is the canonical table.
2. **Persist-Before-ACK Pattern:** Raw webhook payload is persisted to `webhookEvents` table BEFORE acknowledging the provider. If persistence succeeds, the durable record guarantees eventual processing even if the processing step fails transiently.
3. **Two-Phase Processing:** The httpAction persists raw payload (phase 1), then processes in a separate mutation (phase 2). If phase 2 fails, the raw event is marked `"failed"` and can be retried later.
4. **Status Mapping Inside Provider Boundary:** Each provider file owns its status-to-event mapping function (e.g., `mapVoPayStatusToTransferEvent`). This keeps provider-specific logic isolated per REQ-262.
5. **Idempotency Via State Check:** Before firing a transition, the handler checks if the transfer is already in the target state. If so, it silently acknowledges (no duplicate transitions).

From PaymentRailsSpec:

### Supporting entity: `transferWebhooks`
Persist every inbound provider callback before processing:
- `providerKey`
- `externalEventId`
- `signatureVerified`
- `receivedAt`
- `payload`
- `normalizedEventType`
- `processingStatus`
- `transferRequestId`
This creates a replay-safe audit trail and a dedupe barrier.

### Foot gun 6: Assuming provider callbacks are exactly once
Webhooks will retry, arrive out of order, and occasionally conflict with polling. Processing must be replay-safe and monotonic.

## Requirements and Use Cases
REQ-257:

Payment providers may deliver the same webhook multiple times. The webhook handler must process each unique event exactly once, silently acknowledging duplicates without side effects.

Acceptance Criteria:
Given a webhook with providerRef 'vopay-txn-123' and event 'confirmed' is received, when the same webhook is delivered again, then the second delivery is acknowledged with 200 status, no duplicate transfer state transition occurs, no duplicate cash ledger entry is created, and the deduplication is logged for monitoring.

REQ-262:

All provider-specific behavior — API call formats, authentication, error code mapping, settlement timing, retry logic — must live inside the provider implementation. The transfer lifecycle and all consuming systems must interact only with the normalized provider interface.

Acceptance Criteria:
Given a VoPay-specific error code 'E_INSUFFICIENT_FUNDS', when the provider implementation processes it, then it maps to the normalized platform error 'NSF' with a human-readable reason. No code outside the VoPay provider implementation references VoPay-specific constants, API URLs, or error formats.

## Integration Points
ENG-192 is already done and guarantees the transfer domain can consume webhook-driven state transitions:

- `sendCommand({ entityType: 'transfer', entityId, event })` works end-to-end
- `executeTransition()` step 7 journals every transfer transition
- `executeTransition()` is the only path that writes governed transfer status
- effect handlers already exist in `convex/engine/effects/transfer.ts`

ENG-204 will depend on this chunk’s abstractions:

1. **VoPay signature verification**: HMAC-SHA256 signature validation for incoming webhooks
2. **VoPay status mapping**: Map VoPay-specific event types to normalized Transfer Lifecycle events:
   * VoPay `completed`/`success` → `FUNDS_SETTLED`
   * VoPay `failed`/`nsf`/`declined` → `TRANSFER_FAILED` (with normalized errorCode)
   * VoPay `returned`/`reversed` → `TRANSFER_REVERSED`
3. **Wire both PAD and EFT endpoints**: `/webhooks/pad_vopay` and `/webhooks/eft_vopay`

## Current Repo Constraints
- `convex/schema.ts` already has `transferRequests.by_provider_ref` on `["providerCode", "providerRef"]`.
- `convex/schema.ts` already has `webhookEvents` with `provider`, `providerEventId`, `rawBody`, `status`, `receivedAt`, `processedAt`, `error`, and `attempts`.
- `convex/payments/webhooks/vopay.ts` already persists raw VoPay events and updates `webhookEvents` status, but the file currently owns all persistence logic directly.
- `convex/payments/webhooks/verification.ts` already exposes `verifyVoPaySignatureAction` and `verifyRotessaSignatureAction`.
- `convex/payments/webhooks/types.ts` currently models reversal payloads for `rotessa`, `stripe`, and `pad_vopay`; do not break the existing reversal flow.

## File Structure
- `convex/schema.ts`
- `convex/payments/webhooks/`
  - `vopay.ts`
  - `rotessa.ts`
  - `verification.ts`
  - `types.ts`
  - `utils.ts`
- New shared helper(s) should live under `convex/payments/webhooks/` rather than inside `transfers/`, because the immediate concern is provider webhook ingestion.
