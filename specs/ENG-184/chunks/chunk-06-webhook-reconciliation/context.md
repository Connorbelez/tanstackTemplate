# Chunk 6 Context: Webhook & Reconciliation

## Goal
Create the VoPay webhook handler skeleton, add signature verification, wire HTTP routes, and implement the cross-system reconciliation cron.

---

## T-020: Create `convex/payments/webhooks/vopay.ts`

Follow the EXACT pattern from existing Rotessa webhook handler.

**Existing Rotessa webhook handler pattern (reference):**
```typescript
// convex/payments/webhooks/rotessa.ts pattern:
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { verifyRotessaSignature } from "./verification";

export const rotessaWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  const signature = request.headers.get("X-Rotessa-Signature") ?? "";
  const secret = process.env.ROTESSA_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[rotessa-webhook] Missing ROTESSA_WEBHOOK_SECRET");
    return new Response("Configuration error", { status: 500 });
  }

  if (!verifyRotessaSignature(body, signature, secret)) {
    console.warn("[rotessa-webhook] Invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  // Return 200 immediately, process async
  const payload = JSON.parse(body);
  await ctx.runMutation(internal.payments.webhooks.rotessaProcessor.processRotessaWebhook, {
    payload,
  });

  return new Response("OK", { status: 200 });
});
```

**VoPay skeleton handler:**
- HTTP action at `/webhooks/pad_vopay`
- Read `X-VoPay-Signature` header (VoPay-specific — format TBD in Phase 2)
- Verify HMAC-SHA256 signature using `VOPAY_WEBHOOK_SECRET` env var
- Return 200 immediately
- Schedule internal mutation for processing
- Processing mutation:
  1. Look up transfer by `providerCode: 'pad_vopay'` + `providerRef` from payload
  2. Map VoPay status → Transfer event (`FUNDS_SETTLED`, `TRANSFER_FAILED`, `TRANSFER_REVERSED`)
  3. Fire transition via `executeTransition()`
  4. Idempotency: if transfer already in target state, return success

**IMPORTANT:** This is a SKELETON — the VoPay-specific payload format is TBD. Use placeholder parsing that extracts `providerRef`, `status`, and `amount` from the webhook body. Phase 2 (ENG-185) fills in the real parsing.

---

## T-021: Add VoPay Signature Verification

**File:** `convex/payments/webhooks/verification.ts`

**Existing pattern:**
```typescript
export function verifyRotessaSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(sigBuffer, expectedBuffer);
}
```

Add `verifyVoPaySignature` following the same HMAC-SHA256 pattern. The signature header name and format can be placeholder values.

---

## T-022: Add HTTP Route

**File:** `convex/http.ts`

**Current routes (lines 10-19):**
```typescript
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
```

Add:
```typescript
http.route({
  path: "/webhooks/pad_vopay",
  method: "POST",
  handler: vopayWebhook,
});
```

Import the handler from `./payments/webhooks/vopay`.

---

## T-023: Create `convex/payments/transfers/reconciliation.ts`

Implement the reconciliation query and self-healing logic.

**Contract from spec:**
```typescript
async function findOrphanedConfirmedTransfers(ctx: QueryCtx) {
  // 1. Query transferRequests with status: 'confirmed'
  // 2. For each, check for matching cash_ledger_journal_entry
  //    - Idempotency key pattern: `cash-ledger:cash-received:transfer:{transferRequestId}`
  //      OR `cash-ledger:lender-payout-sent:transfer:{transferRequestId}`
  // 3. If no entry exists AND transfer is older than 5 minutes → orphaned
  // 4. For bridged transfers (have collectionAttemptId), the journal entry
  //    exists via the attempt path — verify it exists by attemptId instead
}
```

**Self-healing logic:**
1. For each orphaned transfer, check `transferHealingAttempts` table
2. If no healing attempt exists OR last attempt was > 5 min ago AND attemptCount < 3:
   - Increment attemptCount
   - Re-schedule the `publishTransferConfirmed` effect
3. If attemptCount >= 3:
   - Set status to `"escalated"` on the healing attempt
   - Log admin alert
   - Record `escalatedAt` timestamp

**Create as internal mutation** (called by cron):
```typescript
export const transferReconciliationCron = internalMutation({
  handler: async (ctx) => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    // ... reconciliation logic ...
  },
});
```

**Existing `transferHealingAttempts` table (already in schema):**
```typescript
transferHealingAttempts: defineTable({
  transferRequestId: v.id("transferRequests"),
  attemptCount: v.number(),
  lastAttemptAt: v.number(),
  escalatedAt: v.optional(v.number()),
  status: v.union(
    v.literal("retrying"),
    v.literal("escalated"),
    v.literal("resolved")
  ),
  createdAt: v.number(),
})
  .index("by_transfer_request", ["transferRequestId"])
  .index("by_status", ["status"]),
```

---

## T-024: Wire Reconciliation Cron

**File:** `convex/crons.ts`

**Current cron entry (lines 36-45):**
```typescript
crons.interval(
  "transfer reconciliation",
  { minutes: 15 },
  internal.payments.cashLedger.transferReconciliationCron.transferReconciliationCron
);
```

This already points to `internal.payments.cashLedger.transferReconciliationCron.transferReconciliationCron`. Check if this matches the actual file path of the new reconciliation module. If the reconciliation is placed at `convex/payments/transfers/reconciliation.ts`, the cron reference may need updating.

Verify the cron reference matches the actual export path, and update if needed.
