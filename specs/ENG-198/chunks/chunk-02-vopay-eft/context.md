# Chunk 2 Context: VoPay PAD and EFT Transfer Handlers

## Scope
Finish the VoPay transfer-domain pipeline so the existing PAD handler conforms to the issue’s async-ack + durable-store requirements and add the missing EFT webhook route/handler for outbound transfers.

## Verbatim Acceptance Criteria (ENG-198 and ENG-204)
- Webhook handler returns 200 immediately, processes async (REQ-257)
- Duplicate webhooks are silently acknowledged — no duplicate state transitions or ledger entries
- Invalid signatures are rejected with 401
- Handler works for both inbound and outbound provider callbacks

From ENG-204:
- VoPay webhooks are verified before processing
- All VoPay status codes are mapped within the VoPay provider boundary
- Duplicate webhooks handled idempotently (REQ-257)
- Wire both PAD and EFT endpoints: `/webhooks/pad_vopay` and `/webhooks/eft_vopay`

## Verbatim Design Context
From the ENG-198 Notion implementation plan:

### Step 2: Update VoPay processWebhook to set transferRequestId
- **File(s):** `convex/payments/webhooks/vopay.ts`
- **Action:** After transfer lookup in `processVoPayWebhook`, update the `webhookEvents` record with the resolved `transferRequestId`.

### Step 3: Create EFT VoPay webhook handler
- **File(s):** `convex/payments/webhooks/eftVopay.ts` (Create)
- **Action:** Mirror the PAD VoPay handler but with `providerCode: "eft_vopay"`. Reuse the same status mapping function (`mapVoPayStatusToTransferEvent`) — VoPay uses the same status codes for both PAD and EFT.
- **Details:**
  - HTTP action: verify VoPay signature → persist raw event → process → update status
  - Processing mutation: lookup transfer by `by_provider_ref` with `providerCode: "eft_vopay"`, map status, fire transition
  - Share `persistRawWebhookEvent` and `updateWebhookEventStatus` from `vopay.ts` (or extract to shared module)

### Step 4: Register EFT VoPay route in http.ts
- **File(s):** `convex/http.ts`
- **Action:** Add `http.route({ path: "/webhooks/eft_vopay", method: "POST", handler: eftVopayWebhook })`

From UC-152:

1. Provider sends webhook POST to /api/webhooks/\{provider\}
2. Handler verifies webhook signature per provider's signing method
3. Handler extracts providerRef and event type from payload
4. Handler looks up pending transfer by providerRef
5. If event is 'confirmed': Transition Engine fires CONFIRMED event on transfer
6. Transfer: initiated/processing → confirmed
7. Cash Ledger Bridge fires (effect on confirmed transition)
8. Webhook handler returns 200 immediately

Idempotency:
- Duplicate webhook deliveries: if transfer already confirmed, webhook is silently acknowledged
- providerRef + event type combination tracked to prevent re-processing

From UC-153:

1. Provider sends webhook with NSF/decline event
2. Handler verifies signature, extracts providerRef
3. Transfer: initiated/processing → failed (with errorCode: 'NSF', reason from provider)
4. Failure effect publishes event for downstream systems
5. Collection Plan rules engine receives failure event
6. Retry rule evaluates: if retries remaining, creates new collection plan entry with delay
7. Late fee rule evaluates: if grace period expired, creates late fee obligation

## Current Repo Constraints
- `convex/http.ts` currently registers `/webhooks/rotessa`, `/webhooks/stripe`, and `/webhooks/pad_vopay` only.
- `convex/payments/webhooks/vopay.ts` already provides:
  - `mapVoPayStatusToTransferEvent()`
  - `persistRawWebhookEvent`
  - `updateWebhookEventStatus`
  - `processVoPayWebhook`
- The current PAD VoPay processing mutation looks up transfers with:
  - `.query("transferRequests").withIndex("by_provider_ref", (q) => q.eq("providerCode", "pad_vopay").eq("providerRef", args.transactionId))`
- The current idempotency target-state map is:
  - `FUNDS_SETTLED -> confirmed`
  - `TRANSFER_FAILED -> failed`
  - `TRANSFER_REVERSED -> reversed`
  - `PROCESSING_UPDATE -> processing`
- `convex/payments/webhooks/verification.ts` already has `verifyVoPaySignatureAction`.

## Provider Boundary Rule
REQ-262 means the shared webhook core may handle persistence, dedupe plumbing, and transition dispatch wiring, but VoPay-specific status strings and any status-to-event mapping must remain in VoPay-owned code.

## File Structure
- `convex/payments/webhooks/vopay.ts`
- `convex/payments/webhooks/eftVopay.ts` (new)
- `convex/http.ts`
- Shared helper(s) created in Chunk 1
