# Chunk 02 Context — Transfer Effects + Cron Alert

## What You're Building

Two things:
1. **Effect integration** — When a `lender_dispersal_payout` transfer confirms or fails, update the linked dispersal entry's status accordingly.
2. **Daily alert cron** — Checks for pending entries past hold period and logs a summary for admin visibility.

---

## T-006: Modify publishTransferConfirmed

**File:** `convex/engine/effects/transfer.ts`

**Current code** (lines 87-131):
```typescript
export const publishTransferConfirmed = internalMutation({
  args: transferEffectValidator,
  handler: async (ctx, args) => {
    const transfer = await loadTransfer(ctx, args, "publishTransferConfirmed");

    const settledAt =
      typeof args.payload?.settledAt === "number"
        ? args.payload.settledAt
        : Date.now();

    await ctx.db.patch(args.entityId, { settledAt });

    // D4: bridged transfer — cash posted via collection attempt path
    if (transfer.collectionAttemptId) {
      console.info(
        `[publishTransferConfirmed] Bridged transfer ${args.entityId} — cash posted via collection attempt path. Skipping.`
      );
    } else if (transfer.direction === "inbound") {
      await postCashReceiptForTransfer(ctx, {
        transferRequestId: args.entityId,
        source: args.source,
      });
    } else if (transfer.direction === "outbound") {
      await postLenderPayoutForTransfer(ctx, {
        transferRequestId: args.entityId,
        source: args.source,
      });
    } else {
      throw new Error(
        `[publishTransferConfirmed] Transfer ${args.entityId} has no direction set. ` +
          "Cannot post cash entry — this is a data integrity violation."
      );
    }

    // Pipeline orchestration
    await handlePipelineLegConfirmed(ctx, transfer);
  },
});
```

**What to add:** After the cash posting block (after the `else` block, before pipeline orchestration), add dispersal entry status update:

```typescript
// ── Dispersal entry lifecycle (disbursement confirmation) ────────
if (transfer.transferType === "lender_dispersal_payout" && transfer.dispersalEntryId) {
  const settledDate = typeof args.payload?.settledAt === "number"
    ? new Date(args.payload.settledAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  await ctx.db.patch(transfer.dispersalEntryId, {
    status: "disbursed",
    payoutDate: settledDate,
  });

  console.info(
    `[publishTransferConfirmed] Dispersal entry ${transfer.dispersalEntryId} → disbursed (payoutDate: ${settledDate})`
  );
}
```

**Why here:** The implementation plan recommends Option A (effect-driven) — keeps the lifecycle synchronous and atomic within the same mutation as the cash posting.

---

## T-007: Modify publishTransferFailed

**File:** `convex/engine/effects/transfer.ts`

**Current code** (lines 276-303):
```typescript
export const publishTransferFailed = internalMutation({
  args: transferEffectValidator,
  handler: async (ctx, args) => {
    const transfer = await loadTransfer(ctx, args, "publishTransferFailed");

    const errorCode =
      typeof args.payload?.errorCode === "string"
        ? args.payload.errorCode
        : "UNKNOWN";
    const reason =
      typeof args.payload?.reason === "string"
        ? args.payload.reason
        : "unknown_failure";

    await ctx.db.patch(args.entityId, {
      failedAt: Date.now(),
      failureReason: reason,
      failureCode: errorCode,
    });

    console.warn(
      `[publishTransferFailed] Transfer ${args.entityId} failed: ${reason} (${errorCode})`
    );

    // Pipeline failure handling
    await handlePipelineLegFailed(ctx, transfer, reason, errorCode);
  },
});
```

**What to add:** After the `ctx.db.patch` and console.warn, before pipeline failure handling:

```typescript
// ── Dispersal entry failure ─────────────────────────────────────
if (transfer.transferType === "lender_dispersal_payout" && transfer.dispersalEntryId) {
  await ctx.db.patch(transfer.dispersalEntryId, {
    status: "failed",
  });

  console.warn(
    `[publishTransferFailed] Dispersal entry ${transfer.dispersalEntryId} → failed (transfer: ${args.entityId}, reason: ${reason})`
  );
}
```

---

## T-008: Create checkDisbursementsDue

**File:** `convex/dispersal/disbursementBridge.ts` (add to the file created in Chunk 01)

```typescript
export const checkDisbursementsDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().slice(0, 10);

    // Reuse same eligible-entry logic as findEligibleEntriesInternal
    // but inline here since this is a mutation (can't call a query from a mutation)
    const pendingPastHold = await ctx.db
      .query("dispersalEntries")
      .withIndex("by_eligibility", (q) =>
        q.eq("status", "pending").lte("payoutEligibleAfter", today)
      )
      .collect();

    const eligibleWithHold = pendingPastHold.filter(
      (e) => e.payoutEligibleAfter !== undefined && e.payoutEligibleAfter !== ""
    );

    const pendingAll = await ctx.db
      .query("dispersalEntries")
      .withIndex("by_eligibility", (q) => q.eq("status", "pending"))
      .collect();

    const eligibleLegacy = pendingAll.filter((e) => !e.payoutEligibleAfter);

    const eligible = [...eligibleWithHold, ...eligibleLegacy];

    if (eligible.length === 0) return;

    // Summarize by lender
    const byLender = new Map<string, { count: number; total: number }>();
    for (const e of eligible) {
      const existing = byLender.get(e.lenderId) ?? { count: 0, total: 0 };
      existing.count++;
      existing.total += e.amount;
      byLender.set(e.lenderId, existing);
    }

    console.warn(
      `[DISPERSAL_DUE] ${eligible.length} entries ready for disbursement ` +
        `across ${byLender.size} lenders as of ${today}`
    );

    // TODO Phase 2: push to admin notification table / email via Resend
  },
});
```

---

## T-009: Register cron

**File:** `convex/crons.ts`

**Current cron schedule (for reference):**
```
06:00 UTC - processObligationTransitions
07:00 UTC - dailyReconciliation
07:15 UTC - cashLedgerReconciliation
08:00 UTC - processPayoutBatch
Every 15 min - dispersalSelfHealingCron
Every 15 min - transferReconciliationCron
```

**Add:** Daily at 09:00 UTC (after payout batch at 08:00) — checks for pending disbursements.

```typescript
crons.daily(
  "check-disbursements-due",
  { hourUTC: 9, minuteUTC: 0 },
  internal.dispersal.disbursementBridge.checkDisbursementsDue
);
```

The `internal` import is already available in crons.ts. Follow the existing pattern.

---

## Transfer type reference

The `transfer.transferType` field uses the union: `"lender_dispersal_payout"` for outbound disbursements.
The `transfer.dispersalEntryId` is `Id<"dispersalEntries"> | undefined` — set by the bridge in Chunk 01.

---

## Dispersal status validator

```typescript
// From convex/dispersal/validators.ts
export const dispersalStatusValidator = v.union(
  v.literal("pending"),
  v.literal("disbursed"),
  v.literal("failed"),
  v.literal("skipped"),
  v.literal("escalated")
);
```

Both `"disbursed"` and `"failed"` are valid status values in the schema.

---

## Constraints

- The effect runs inside the same mutation as the cash posting — it's atomic.
- `payoutDate` format: `"YYYY-MM-DD"` (same as `dispersalDate`).
- The `settledAt` value on the transfer is a Unix timestamp (ms). Convert to YYYY-MM-DD for `payoutDate`.
- Only patch dispersal entry if `transfer.transferType === "lender_dispersal_payout"` AND `transfer.dispersalEntryId` exists.
- The cron does NOT auto-trigger disbursements. It only logs a warning.
