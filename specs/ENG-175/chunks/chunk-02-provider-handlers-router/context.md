# Chunk 02 Context: Provider Handlers + Router Registration

## Overview
Create provider-specific webhook httpAction handlers for Rotessa PAD and Stripe ACH, plus register the routes in the HTTP router. These handlers parse provider-specific payloads, verify signatures, and delegate to the shared `handlePaymentReversal` action from chunk-01.

---

## T-005: Create Rotessa PAD Webhook Handler

**File:** `convex/payments/webhooks/rotessa.ts` (new)

### Rotessa PAD Reversal Events
Rotessa sends webhooks for these reversal-related events:
- `transaction.nsf` — Non-Sufficient Funds
- `transaction.returned` — PAD return
- `transaction.reversed` — Manual reversal

### Implementation:

```typescript
import { httpAction } from "../../_generated/server";
import { handlePaymentReversal } from "./handleReversal";
import { verifyRotessaSignature } from "./verification";
import type { ReversalWebhookPayload } from "./types";

// Events we handle — all others return 200 but are ignored (Foot Gun P5)
const REVERSAL_EVENT_TYPES = new Set([
  "transaction.nsf",
  "transaction.returned",
  "transaction.reversed",
]);

export const rotessaWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  const signature = request.headers.get("X-Rotessa-Signature") ?? "";

  // 1. Get webhook secret from environment
  const secret = process.env.ROTESSA_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[rotessaWebhook] ROTESSA_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "server_configuration_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Verify signature
  if (!verifyRotessaSignature(body, signature, secret)) {
    console.warn("[rotessaWebhook] Invalid signature");
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Parse event
  let event: RotessaWebhookEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 4. Filter for reversal events only — return 200 for others (Foot Gun P5)
  if (!REVERSAL_EVENT_TYPES.has(event.event_type)) {
    return new Response(JSON.stringify({ received: true, ignored: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 5. Map to normalized payload
  const payload: ReversalWebhookPayload = {
    providerRef: event.data.transaction_id, // or however Rotessa identifies the original transaction
    provider: "rotessa",
    reversalReason: mapRotessaReason(event.event_type, event.data),
    reversalCode: event.data.return_code,
    originalAmount: Math.round(event.data.amount * 100), // Convert dollars to cents
    reversalDate: event.data.date || new Date().toISOString().slice(0, 10),
    providerEventId: event.data.event_id || `rotessa:${event.event_type}:${event.data.transaction_id}`,
  };

  // 6. Process reversal
  const result = await handlePaymentReversal(ctx, payload);

  // 7. Always return 200 to prevent retry storms (Foot Gun P6)
  return new Response(JSON.stringify({ received: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

### Rotessa Event Shape (approximate — see Open Question #1):
Since exact Rotessa payload format is an open question, define a reasonable interface based on common PAD webhook patterns:

```typescript
interface RotessaWebhookEvent {
  event_type: string;
  data: {
    transaction_id: string;  // Our providerRef
    amount: number;          // Dollar amount (convert to cents)
    return_code?: string;    // NSF code etc.
    date?: string;           // YYYY-MM-DD
    event_id?: string;       // Unique event identifier
    reason?: string;
  };
}
```

### Reason mapping:
```typescript
function mapRotessaReason(eventType: string, data: RotessaWebhookEvent["data"]): string {
  switch (eventType) {
    case "transaction.nsf": return `NSF: ${data.reason ?? "Non-Sufficient Funds"}`;
    case "transaction.returned": return `PAD Return: ${data.return_code ?? "unknown"} — ${data.reason ?? ""}`;
    case "transaction.reversed": return `Manual Reversal: ${data.reason ?? ""}`;
    default: return `Rotessa reversal: ${eventType}`;
  }
}
```

---

## T-006: Create Stripe ACH Webhook Handler

**File:** `convex/payments/webhooks/stripe.ts` (new)

### Stripe ACH Reversal Events
- `charge.dispute.created` — Dispute opened (Foot Gun P4: freeze + separate handling)
- `charge.refunded` — ACH return processed
- `payment_intent.payment_failed` — ACH failure after initial success

### Implementation:

```typescript
import { httpAction } from "../../_generated/server";
import { handlePaymentReversal } from "./handleReversal";
import { verifyStripeSignature } from "./verification";
import type { ReversalWebhookPayload } from "./types";

const REVERSAL_EVENT_TYPES = new Set([
  "charge.dispute.created",
  "charge.refunded",
  "payment_intent.payment_failed",
]);

export const stripeWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  const signatureHeader = request.headers.get("stripe-signature") ?? "";

  // 1. Get webhook secret
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripeWebhook] STRIPE_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "server_configuration_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Verify signature
  if (!verifyStripeSignature(body, signatureHeader, secret)) {
    console.warn("[stripeWebhook] Invalid signature");
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Parse event
  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 4. Filter for reversal events
  if (!REVERSAL_EVENT_TYPES.has(event.type)) {
    return new Response(JSON.stringify({ received: true, ignored: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 5. Map to normalized payload
  //    Stripe uses different object structures per event type
  const payload = mapStripeEventToPayload(event);
  if (!payload) {
    return new Response(JSON.stringify({ received: true, error: "unmappable_event" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 6. For disputes: log additional warning (Foot Gun P4)
  if (event.type === "charge.dispute.created") {
    console.warn(
      `[stripeWebhook] Dispute received for charge ${event.data.object.id}. ` +
      `Full dispute resolution is Phase 2+ (ENG-180 scope). ` +
      `Processing as reversal + flagging obligation.`
    );
  }

  // 7. Process reversal
  const result = await handlePaymentReversal(ctx, payload);

  return new Response(JSON.stringify({ received: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

### Stripe Event Shape:
```typescript
interface StripeWebhookEvent {
  id: string;            // evt_xxx — unique event ID
  type: string;          // e.g., "charge.refunded"
  data: {
    object: {
      id: string;        // ch_xxx or pi_xxx
      amount: number;    // cents
      metadata?: Record<string, string>; // Our providerRef stored here
      payment_intent?: string;
      failure_code?: string;
      failure_message?: string;
      // For disputes:
      charge?: string;
      reason?: string;
      status?: string;
    };
  };
  created: number;       // Unix timestamp
}
```

### Stripe payload mapping:
```typescript
function mapStripeEventToPayload(event: StripeWebhookEvent): ReversalWebhookPayload | null {
  const obj = event.data.object;
  // providerRef is stored in charge/payment_intent metadata
  const providerRef = obj.metadata?.provider_ref || obj.metadata?.providerRef || obj.id;

  switch (event.type) {
    case "charge.refunded":
      return {
        providerRef,
        provider: "stripe",
        reversalReason: `ACH Return: ${obj.failure_message ?? "refunded"}`,
        reversalCode: obj.failure_code,
        originalAmount: obj.amount,
        reversalDate: new Date(event.created * 1000).toISOString().slice(0, 10),
        providerEventId: event.id,
      };
    case "charge.dispute.created":
      return {
        providerRef: obj.charge || obj.id,
        provider: "stripe",
        reversalReason: `Dispute: ${obj.reason ?? "unknown"}`,
        reversalCode: "DISPUTE",
        originalAmount: obj.amount,
        reversalDate: new Date(event.created * 1000).toISOString().slice(0, 10),
        providerEventId: event.id,
      };
    case "payment_intent.payment_failed":
      return {
        providerRef: obj.id,
        provider: "stripe",
        reversalReason: `ACH Failure: ${obj.failure_message ?? "payment_failed"}`,
        reversalCode: obj.failure_code,
        originalAmount: obj.amount,
        reversalDate: new Date(event.created * 1000).toISOString().slice(0, 10),
        providerEventId: event.id,
      };
    default:
      return null;
  }
}
```

---

## T-007: Register Webhook Routes in HTTP Router

**File:** `convex/http.ts` (modify)

### Current state:
```typescript
import { httpRouter } from "convex/server";
import { authKit } from "./auth";

const http = httpRouter();
authKit.registerRoutes(http);
export default http;
```

### After modification:
```typescript
import { httpRouter } from "convex/server";
import { authKit } from "./auth";
import { rotessaWebhook } from "./payments/webhooks/rotessa";
import { stripeWebhook } from "./payments/webhooks/stripe";

const http = httpRouter();

authKit.registerRoutes(http);

// Payment provider webhook endpoints
http.route({
  path: "/webhooks/rotessa",
  method: "POST",
  handler: rotessaWebhook,
});

http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: stripeWebhook,
});

export default http;
```

---

## Codebase Patterns

### httpAction pattern (Convex HTTP actions):
- `httpAction` handlers receive `(ctx, request)` where `request` is a standard `Request` object
- `ctx` has `runMutation`, `runQuery`, `runAction` methods
- Must return a `Response` object
- Can access `process.env` for environment variables
- CANNOT directly call DB — must delegate to mutations/queries

### Webhook handler conventions from implementation plan:
- Always return 200 for unrecognized events to prevent retry storms (Foot Gun P5)
- Verify signatures before any processing
- Log warnings for unexpected states but don't crash
- Use `console.warn` for issues, `console.error` for configuration problems
- Source attribution: `{ actorType: "system", channel: "api_webhook", actorId: "webhook:provider" }`

### Environment variables needed:
- `ROTESSA_WEBHOOK_SECRET` — HMAC key for Rotessa
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret

### Dependencies from chunk-01:
- `handlePaymentReversal` from `./handleReversal`
- `verifyRotessaSignature`, `verifyStripeSignature` from `./verification`
- `ReversalWebhookPayload` from `./types`
