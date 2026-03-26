# Chunk 01 Context: Infrastructure + Core Reversal Logic

## Overview
Create the foundational webhook infrastructure: signature verification, shared types, internal reversal mutation, and shared reversal handler action. These are the building blocks used by Rotessa and Stripe webhook handlers in chunk-02.

---

## T-001: Create Webhook Signature Verification Utilities

**File:** `convex/payments/webhooks/verification.ts` (new)

Create two signature verification functions:

### Rotessa PAD Signature
- Header: `X-Rotessa-Signature`
- Algorithm: HMAC-SHA256
- Secret: `ROTESSA_WEBHOOK_SECRET` environment variable
- Constant-time comparison to prevent timing attacks

### Stripe Signature
- Header: `stripe-signature`
- Format: `t=timestamp,v1=signature`
- Algorithm: HMAC-SHA256 of `${timestamp}.${body}`
- Secret: `STRIPE_WEBHOOK_SECRET` environment variable
- Constant-time comparison
- Optional: timestamp tolerance check (5 minutes)

```typescript
// Signature verification for Rotessa + Stripe webhook handlers
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRotessaSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  // HMAC-SHA256, constant-time comparison
}

export function verifyStripeSignature(
  body: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds?: number // default 300 (5 min)
): boolean {
  // Parse t=timestamp,v1=signature format
  // HMAC-SHA256 of `${timestamp}.${body}`
  // Constant-time comparison + optional timestamp tolerance
}
```

**IMPORTANT:** These run inside Convex `httpAction` handlers. `node:crypto` is available in Convex actions.

---

## T-002: Create Shared Reversal Types

**File:** `convex/payments/webhooks/types.ts` (new)

Define the shared types used across webhook handlers:

```typescript
import type { Id } from "../../_generated/dataModel";

/** Normalized payload from any payment provider's reversal webhook */
export interface ReversalWebhookPayload {
  providerRef: string;         // Maps to collectionAttempts.providerRef
  provider: "rotessa" | "stripe";
  reversalReason: string;      // Human-readable reason
  reversalCode?: string;       // Provider-specific code (e.g., "NSF", "R01")
  originalAmount: number;      // cents
  reversalDate: string;        // YYYY-MM-DD
  providerEventId: string;     // For idempotency dedup
}

/** Result from processing a reversal */
export interface ReversalResult {
  success: boolean;
  reason?: string;             // If not successful, why
  attemptId?: Id<"collectionAttempts">;
  postingGroupId?: string;
  clawbackRequired?: boolean;
}
```

---

## T-003: Create Internal Reversal Mutation

**File:** `convex/payments/webhooks/processReversal.ts` (new)

This is an `internalMutation` that fires the GT transition `confirmed → reversed` for a collection attempt. The cash-ledger reversal cascade is handled entirely by the effect-driven architecture — not by a direct call in this mutation.

**EFFECT-DRIVEN ARCHITECTURE:** The `emitPaymentReversed` effect (registered in ENG-173) handles the per-obligation cash-ledger reversal cascade automatically. When `executeTransition()` fires the `PAYMENT_REVERSED` event, the effect handler iterates `planEntry.obligationIds` and calls `postPaymentReversalCascade()` for each obligation. Each call is idempotent via `postingGroupId`, so retries are safe. This mutation fires the transition exactly ONCE per collection attempt — it should NOT be called per-obligation.

### Key imports and contracts:

```typescript
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { executeTransition } from "../../engine/transition";
import type { CommandSource } from "../../engine/types";
```

### Function signature:
```typescript
export const processReversalCascade = internalMutation({
  args: {
    attemptId: v.id("collectionAttempts"),
    effectiveDate: v.string(),       // YYYY-MM-DD
    reason: v.string(),
    provider: v.union(v.literal("rotessa"), v.literal("stripe")),
    providerEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const source: CommandSource = {
      actorType: "system",
      channel: "api_webhook",
      actorId: `webhook:${args.provider}`,
    };

    // Fire the GT transition: confirmed → reversed
    // The emitPaymentReversed effect handles the per-obligation
    // cash ledger reversal cascade (via postPaymentReversalCascade).
    const transitionResult = await executeTransition(ctx, {
      entityType: "collectionAttempt",
      entityId: args.attemptId,
      eventType: "PAYMENT_REVERSED",
      payload: {
        reason: args.reason,
        provider: args.provider,
        providerEventId: args.providerEventId,
        effectiveDate: args.effectiveDate,
      },
      source,
    });

    return {
      success: transitionResult.success,
      newState: transitionResult.newState,
    };
  },
});
```

### EntityType for collectionAttempt:
The GT engine uses `"collectionAttempt"` as the entityType string.

### CommandSource channel:
Use `"api_webhook"` which is a valid `CommandChannel` value (see `convex/engine/types.ts` line 35).

---

## T-004: Create Shared Reversal Handler Action

**File:** `convex/payments/webhooks/handleReversal.ts` (new)

This is a plain async function (NOT a Convex function) used by both Rotessa and Stripe httpAction handlers. It orchestrates:
1. Look up collection attempt by providerRef
2. Validate attempt state (must be `confirmed`)
3. Load related plan entry for obligationIds
4. Call the internal mutation `processReversalCascade`

```typescript
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { ReversalWebhookPayload, ReversalResult } from "./types";
```

### Implementation:
```typescript
export async function handlePaymentReversal(
  ctx: ActionCtx,
  payload: ReversalWebhookPayload
): Promise<ReversalResult> {
  // 1. Look up collection attempt by providerRef
  //    Use ctx.runQuery to query by_provider_ref index
  //    If not found → return { success: false, reason: "attempt_not_found" }

  // 2. Check attempt state
  //    If already "reversed" → idempotent skip, return success
  //    If not "confirmed" → return { success: false, reason: "invalid_state" }
  //    (Return 200 to provider anyway to prevent retry storms)

  // 3. Load plan entry from attempt.planEntryId
  //    Get obligationIds from planEntry
  //    Get mortgageId from first obligation

  // 4. Call processReversalCascade via ctx.runMutation
  //    ctx.runMutation(internal.payments.webhooks.processReversal.processReversalCascade, {
  //      attemptId, obligationId, mortgageId, effectiveDate, reason, provider, providerEventId
  //    })
  //    Note: Call once per obligation in planEntry.obligationIds
  //    (processReversalCascade handles one obligation at a time)

  // 5. Return result
}
```

### Query for attempt lookup:
You'll need a helper query. Create an `internalQuery` in the same file or a separate queries file:

```typescript
import { internalQuery } from "../../_generated/server";
import { v } from "convex/values";

export const getAttemptByProviderRef = internalQuery({
  args: { providerRef: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("collectionAttempts")
      .withIndex("by_provider_ref", (q) => q.eq("providerRef", args.providerRef))
      .first();
  },
});
```

### Plan entry loading:
```typescript
export const getAttemptWithPlanEntry = internalQuery({
  args: { attemptId: v.id("collectionAttempts") },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) return null;
    const planEntry = attempt.planEntryId ? await ctx.db.get(attempt.planEntryId) : null;
    return { attempt, planEntry };
  },
});
```

---

## Codebase Patterns to Follow

### internalMutation pattern (from `convex/payments/cashLedger/mutations.ts`):
```typescript
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { v } from "convex/values";

export const functionName = internalMutation({
  args: { /* validators */ },
  handler: async (ctx, args) => { /* implementation */ },
});
```

### httpAction pattern:
```typescript
import { httpAction } from "../../_generated/server";

export const webhookHandler = httpAction(async (ctx, request) => {
  // ctx.runMutation, ctx.runQuery, ctx.runAction available
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

### executeTransition signature (from `convex/engine/transition.ts:229`):
```typescript
executeTransition(ctx, {
  entityType: "collectionAttempt",  // EntityType string
  entityId: attemptId,               // String ID
  eventType: "PAYMENT_REVERSED",     // Event name from machine
  payload: { reason: string, ... },  // Passed to effects
  source: CommandSource,
})
```

### CommandSource (from `convex/engine/types.ts:41`):
```typescript
interface CommandSource {
  actorId?: string;
  actorType?: "borrower" | "broker" | "member" | "admin" | "system";
  channel: "dashboard" | "api" | "api_webhook" | "scheduler" | "simulation";
  ip?: string;
  sessionId?: string;
}
```

### collectionAttempts schema (from `convex/schema.ts:678`):
```typescript
collectionAttempts: defineTable({
  // ... other fields
  providerRef: v.optional(v.string()),
  status: v.string(),
  planEntryId: v.id("planEntries"),
  // ...
}).index("by_provider_ref", ["providerRef"])
```

### Collection attempt PAYMENT_REVERSED event type (from machine):
```typescript
{ type: "PAYMENT_REVERSED"; reason: string }
```

### postPaymentReversalCascade (from `convex/payments/cashLedger/integrations.ts:1370`):
```typescript
export async function postPaymentReversalCascade(
  ctx: MutationCtx,
  args: {
    attemptId?: Id<"collectionAttempts">;
    transferRequestId?: Id<"transferRequests">;
    obligationId: Id<"obligations">;
    mortgageId: Id<"mortgages">;
    effectiveDate: string;
    source: CommandSource;
    reason: string;
  }
): Promise<{
  reversalEntries: Doc<"cash_ledger_journal_entries">[];
  postingGroupId: string;
  clawbackRequired: boolean;
}>
```

### emitPaymentReversed effect (from `convex/engine/effects/collectionAttempt.ts:216`):
This effect is already registered and will fire automatically when `executeTransition` processes PAYMENT_REVERSED. It iterates `planEntry.obligationIds` and calls `postPaymentReversalCascade` for each. Since the cascade is idempotent, calling it directly in processReversalCascade AND having the effect call it again is safe.

---

## File Organization
All new files go under `convex/payments/webhooks/`:
```
convex/payments/webhooks/
  verification.ts    ← T-001
  types.ts           ← T-002
  processReversal.ts ← T-003
  handleReversal.ts  ← T-004
```
