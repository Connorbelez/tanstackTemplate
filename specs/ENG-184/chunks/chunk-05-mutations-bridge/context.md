# Chunk 5 Context: Mutations, Queries & Bridge

## Goal
Create the transfer CRUD mutations, queries with RBAC, and the collection attempt → transfer bridge for backward compat (AC #6).

---

## T-017: Create `convex/payments/transfers/mutations.ts`

Use `adminMutation` from `convex/fluent.ts` (Phase 1 entities are seeded via admin mutations — CLAUDE.md design principle).

### `createTransferRequest`
```typescript
export const createTransferRequest = adminMutation
  .input({
    direction: directionValidator,
    transferType: transferTypeValidator,
    amount: v.number(),
    currency: v.optional(v.literal("CAD")),
    counterpartyType: counterpartyTypeValidator,
    counterpartyId: v.string(),
    bankAccountRef: v.optional(v.string()),
    mortgageId: v.optional(v.id("mortgages")),
    obligationId: v.optional(v.id("obligations")),
    dealId: v.optional(v.id("deals")),
    dispersalEntryId: v.optional(v.id("dispersalEntries")),
    planEntryId: v.optional(v.id("collectionPlanEntries")),
    collectionAttemptId: v.optional(v.id("collectionAttempts")),
    providerCode: providerCodeValidator,
    idempotencyKey: v.string(),
    metadata: v.optional(v.any()),
    pipelineId: v.optional(v.string()),
    legNumber: v.optional(v.number()),
  })
  .handler(async (ctx, args) => {
    // 1. Validate amount is positive integer
    // 2. Check idempotency — query by_idempotency index
    //    If exists, return existing ID (dedup)
    // 3. Build source from ctx.viewer using buildSource()
    // 4. Insert transfer with status: 'initiated'
    // 5. Return the new transfer ID
  })
  .public();
```

### `initiateTransfer`
```typescript
export const initiateTransfer = adminMutation
  .input({
    transferId: v.id("transferRequests"),
  })
  .handler(async (ctx, args) => {
    // 1. Load transfer record
    // 2. Validate status is 'initiated'
    // 3. Resolve provider via getTransferProvider(transfer.providerCode)
    // 4. Build TransferRequestInput from record
    // 5. Call provider.initiate(input)
    // 6. Based on result.status:
    //    - 'confirmed': fire FUNDS_SETTLED via executeTransition()
    //    - 'pending': fire PROVIDER_INITIATED via executeTransition()
    // 7. Return transition result
  })
  .public();
```

**Pattern reference — existing deal transition mutation:**
```typescript
export const transitionDeal = adminMutation
  .input({ ...transitionCommandArgs, entityId: v.id("deals") })
  .handler(async (ctx, args) => {
    const source = (args.source as CommandSource | undefined) ??
      buildSource(ctx.viewer, "admin_dashboard");
    return executeTransition(ctx, {
      entityType: "deal",
      entityId: args.entityId,
      eventType: args.eventType,
      payload: args.payload as Record<string, unknown> | undefined,
      source,
    });
  })
  .public();
```

Use the same `executeTransition()` import from `convex/engine/transition.ts` and `buildSource()` from the engine.

---

## T-018: Create `convex/payments/transfers/queries.ts`

Use `authedQuery` with permission gates.

### `getTransferRequest`
```typescript
export const getTransferRequest = authedQuery
  .input({ transferId: v.id("transferRequests") })
  .handler(async (ctx, args) => {
    return ctx.db.get(args.transferId);
  })
  .public();
```

### `listTransfersByMortgage`
```typescript
export const listTransfersByMortgage = authedQuery
  .input({
    mortgageId: v.id("mortgages"),
    status: v.optional(transferStatusValidator),
  })
  .handler(async (ctx, args) => {
    let query = ctx.db
      .query("transferRequests")
      .withIndex("by_mortgage", (q) => {
        const base = q.eq("mortgageId", args.mortgageId);
        return args.status ? base.eq("status", args.status) : base;
      });
    return query.collect();
  })
  .public();
```

### `listTransfersByStatus`
Admin-only view for dashboard:
```typescript
export const listTransfersByStatus = adminQuery
  .input({
    status: transferStatusValidator,
    limit: v.optional(v.number()),
  })
  .handler(async (ctx, args) => {
    return ctx.db
      .query("transferRequests")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .take(args.limit ?? 50);
  })
  .public();
```

**Existing query pattern reference:**
```typescript
// convex/dispersal/queries.ts uses:
export const getDispersal = authedQuery
  .input({ dispersalId: v.id("dispersalEntries") })
  .handler(async (ctx, args) => { ... })
  .public();
```

---

## T-019: Collection Attempt → Transfer Bridge (AC #6)

**File to modify:** `convex/engine/effects/collectionAttempt.ts`

**Current `emitPaymentReceived` function (lines 61-141):**
```typescript
export const emitPaymentReceived = internalMutation({
  args: collectionAttemptEffectValidator,
  handler: async (ctx, args) => {
    const { attempt, planEntry } = await loadAttemptAndPlanEntry(ctx, args, "emitPaymentReceived");
    // ... applies payment to obligations ...
    // ... routes overpayment to UNAPPLIED_CASH ...
  },
});
```

**Add at the END of the handler** (after existing logic, before closing brace):
```typescript
// ─── Phase M2a: Create parallel transfer record for audit trail ───
// Decision D4: Bridged transfers skip cash posting in publishTransferConfirmed
// because the collection attempt path already posted via postCashReceiptForObligation().
await ctx.db.insert("transferRequests", {
  status: "confirmed",
  direction: "inbound",
  transferType: mapPlanEntryToTransferType(planEntry),
  amount: attempt.amount,
  currency: "CAD",
  counterpartyType: "borrower",
  counterpartyId: attempt.borrowerId ?? planEntry.borrowerId ?? "",
  mortgageId: planEntry.mortgageId,
  obligationId: planEntry.obligationIds[0],
  planEntryId: planEntry._id,
  collectionAttemptId: args.entityId,
  providerCode: planEntry.method ?? "manual",
  providerRef: attempt.providerRef ?? `bridge_${args.entityId}`,
  idempotencyKey: `transfer:bridge:${args.entityId}`,
  source: args.source,
  confirmedAt: Date.now(),
  settledAt: Date.now(),
  lastTransitionAt: Date.now(),
  createdAt: Date.now(),
});
```

**Helper function** (add at file level):
```typescript
function mapPlanEntryToTransferType(planEntry: Doc<"collectionPlanEntries">): string {
  // Map obligation type → transfer type
  // This is a best-effort mapping — the planEntry doesn't carry obligation type directly
  // Default to 'borrower_interest_collection' as the most common case
  return "borrower_interest_collection";
}
```

**Key points:**
- The bridge creates the transfer record DIRECTLY with `status: "confirmed"` — it does NOT go through the transition engine
- `collectionAttemptId` is set → `publishTransferConfirmed` effect will SKIP cash posting (Decision D4)
- The existing cash posting via `postCashReceiptForObligation()` is UNCHANGED
- This is Phase M2a: parallel audit trail only
- The `idempotencyKey` uses the attempt ID to ensure one transfer per attempt
