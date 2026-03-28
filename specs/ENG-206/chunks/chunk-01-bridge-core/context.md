# Chunk 01 Context — Bridge Core Module

## What You're Building

The Disbursement Bridge converts eligible `dispersalEntries` (status: `"pending"`, hold period passed) into outbound `transferRequests` of type `lender_dispersal_payout`. One transfer per dispersal entry. When the transfer confirms (handled in Chunk 02), the entry becomes `"disbursed"`.

**File to create:** `convex/dispersal/disbursementBridge.ts`

---

## Key Design Decisions (from Notion implementation plan)

1. **Pending → Disbursed directly.** Skip `"eligible"` status. Entries go `"pending"` → `"disbursed"` on transfer confirmation. The bridge operates on pending entries past hold period.
2. **Admin-only trigger for Phase 1.** A daily cron checks for pending entries and alerts. Admin manually triggers the bridge. Full cron automation is Phase 2.
3. **50 entries per batch**, configurable via args.
4. **Per dispersalEntry granularity** — one outbound transfer per eligible dispersal entry (not batched by lender/date).
5. **Phase 1 uses `mock_eft` provider** — Provider Registry resolves to mock_eft for outbound disbursements.
6. **ENG-219 constraint: Do NOT recompute ownership or amounts.** Use `entry.amount` as-is — it was computed with the correct effective-date ownership snapshot.
7. **Idempotency key format:** `disbursement:{dispersalEntryId}`

---

## Schema Reference

### dispersalEntries table
```typescript
dispersalEntries: defineTable({
  mortgageId: v.id("mortgages"),
  lenderId: v.id("lenders"),
  lenderAccountId: v.optional(v.string()),
  amount: v.number(),             // Already has servicing fee deducted
  dispersalDate: v.string(),      // YYYY-MM-DD
  status: dispersalStatusValidator,  // "pending" | "disbursed" | "failed" | "skipped" | "escalated"
  payoutEligibleAfter: v.optional(v.string()),  // YYYY-MM-DD hold period end
  payoutDate: v.optional(v.string()),           // YYYY-MM-DD when disbursed
  servicingFeeDeducted: v.optional(v.number()),
  obligationId: v.optional(v.id("obligations")),
  mortgageFeeId: v.optional(v.id("mortgageFees")),
  feeCode: v.optional(v.string()),
  idempotencyKey: v.optional(v.string()),
  calculationDetails: v.optional(v.any()),
  createdAt: v.number(),
})
  .index("by_lender", ["lenderId", "dispersalDate"])
  .index("by_mortgage", ["mortgageId", "dispersalDate"])
  .index("by_obligation", ["obligationId"])
  .index("by_status", ["status", "lenderId"])
  .index("by_idempotency", ["idempotencyKey"])
  .index("by_eligibility", ["status", "payoutEligibleAfter"])
```

### transferRequests table (relevant fields)
```typescript
transferRequests: defineTable({
  status: transferStatusValidator,  // "initiated" | "pending" | "processing" | "confirmed" | "failed" | "cancelled" | "reversed"
  direction: directionValidator,    // "inbound" | "outbound"
  transferType: transferTypeValidator,  // includes "lender_dispersal_payout"
  amount: v.number(),
  currency: v.literal("CAD"),
  counterpartyType: counterpartyTypeValidator,  // "borrower" | "lender" | "deal_buyer" | "deal_seller"
  counterpartyId: v.string(),
  // References
  mortgageId: v.optional(v.id("mortgages")),
  dispersalEntryId: v.optional(v.id("dispersalEntries")),
  lenderId: v.optional(v.id("lenders")),
  // Provider & idempotency
  providerCode: providerCodeValidator,  // includes "mock_eft"
  idempotencyKey: v.string(),
  source: sourceValidator,
  createdAt: v.number(),
  lastTransitionAt: v.number(),
})
```

---

## Existing Patterns to Follow

### How createTransferRequestInternal works (convex/payments/transfers/mutations.ts)
```typescript
export const createTransferRequestInternal = internalMutation({
  args: {
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
    lenderId: v.optional(v.id("lenders")),
    borrowerId: v.optional(v.id("borrowers")),
    providerCode: providerCodeValidator,
    idempotencyKey: v.string(),
    pipelineId: v.optional(v.string()),
    legNumber: v.optional(v.number()),
    metadata: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    // Validates amount > 0, integer
    // Validates pipeline fields co-required
    // Validates counterpartyId is domain entity ID (not auth ID)
    // Validates mock providers enabled
    // Idempotency check via by_idempotency index
    // Inserts with status: "initiated", source: PIPELINE_SOURCE
  },
});
```

### How initiateTransferInternal works (convex/payments/transfers/mutations.ts)
```typescript
export const initiateTransferInternal = internalAction({
  args: { transferId: v.id("transferRequests") },
  handler: async (ctx, args) => {
    // Loads transfer, validates status === "initiated"
    // Resolves provider via getTransferProvider(providerCode)
    // Calls provider.initiate(input)
    // If result.status === "confirmed": persistProviderRef + FUNDS_SETTLED transition
    // If result.status === "pending": PROVIDER_INITIATED transition
  },
});
```

### System source pattern
```typescript
const BRIDGE_SOURCE: CommandSource = {
  channel: "scheduler",
  actorType: "system",
};
```

### Disbursement gate (convex/payments/cashLedger/disbursementGate.ts)
```typescript
import { assertDisbursementAllowed } from "../payments/cashLedger/disbursementGate";

// Before creating each transfer:
await assertDisbursementAllowed(ctx, {
  lenderId: entry.lenderId,
  requestedAmount: entry.amount,
});
// Throws ConvexError if requestedAmount > available LENDER_PAYABLE balance
```

### Existing getPayoutEligibleEntries pattern (convex/dispersal/queries.ts:323)
The existing query is RBAC-gated. For the bridge (system context), we need an internal variant:
```typescript
// Query pending entries past hold period using by_eligibility index
const pendingPastHold = await ctx.db
  .query("dispersalEntries")
  .withIndex("by_eligibility", (q) =>
    q.eq("status", "pending").lte("payoutEligibleAfter", args.asOfDate)
  )
  .collect();

// Filter: must have actual payoutEligibleAfter value
const eligibleWithHold = pendingPastHold.filter((entry) => {
  if (args.lenderId && entry.lenderId !== args.lenderId) return false;
  return entry.payoutEligibleAfter !== undefined && entry.payoutEligibleAfter !== "";
});

// Legacy: pending with no payoutEligibleAfter
const pendingAll = await ctx.db
  .query("dispersalEntries")
  .withIndex("by_eligibility", (q) => q.eq("status", "pending"))
  .collect();

const eligibleLegacy = pendingAll.filter((entry) => {
  if (args.lenderId && entry.lenderId !== args.lenderId) return false;
  return !entry.payoutEligibleAfter;
});
```

---

## Implementation Details

### T-001: Types and Helpers

Create the module with:

```typescript
// convex/dispersal/disbursementBridge.ts

export interface DisbursementBridgeResult {
  processed: number;
  skipped: number;
  failed: number;
  transfers: Array<{
    dispersalEntryId: Id<"dispersalEntries">;
    transferRequestId: Id<"transferRequests">;
    amount: number;
    lenderId: Id<"lenders">;
  }>;
  errors: Array<{
    dispersalEntryId: Id<"dispersalEntries">;
    reason: string;
  }>;
}

export function buildDisbursementIdempotencyKey(
  dispersalEntryId: Id<"dispersalEntries">
): string {
  return `disbursement:${dispersalEntryId}`;
}
```

### T-002: findEligibleEntriesInternal

An `internalQuery` (no RBAC) that mirrors the logic of `getPayoutEligibleEntries` but for system use:

```typescript
export const findEligibleEntriesInternal = internalQuery({
  args: {
    asOfDate: v.string(),
    lenderId: v.optional(v.id("lenders")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Same logic as getPayoutEligibleEntries but without RBAC
    // Returns Doc<"dispersalEntries">[]
  },
});
```

### T-003: processSingleDisbursement

An `internalMutation` that processes ONE dispersal entry:

1. **Idempotency check** — query transferRequests by `disbursement:{entryId}` idempotency key. If exists, skip.
2. **Validate entry still pending** — re-read the entry; if status !== "pending", skip (concurrent processing guard).
3. **Disbursement gate** — call `assertDisbursementAllowed(ctx, { lenderId, requestedAmount: entry.amount })`.
4. **Create transfer** — insert into transferRequests directly (same pattern as `createTransferRequestInternal` but inline, since we're already in a mutation and can't call another mutation):

```typescript
const transferId = await ctx.db.insert("transferRequests", {
  status: "initiated",
  direction: "outbound",
  transferType: "lender_dispersal_payout",
  amount: entry.amount,
  currency: "CAD",
  counterpartyType: "lender",
  counterpartyId: entry.lenderId,  // lenderId IS the domain entity ID
  mortgageId: entry.mortgageId,
  lenderId: entry.lenderId,
  dispersalEntryId: entry._id,
  providerCode: providerCode,  // "mock_eft" for Phase 1
  idempotencyKey: buildDisbursementIdempotencyKey(entry._id),
  source: BRIDGE_SOURCE,
  createdAt: now,
  lastTransitionAt: now,
});
```

**Important:** The `counterpartyId` must be a string. Convex `Id<"lenders">` IS a string already (domain entity ID, not WorkOS auth ID). No conversion needed.

Return `{ transferId, skipped: false }` or `{ transferId: null, skipped: true, reason: "..." }`.

### T-004: triggerDisbursementBridge

An `internalAction` that orchestrates:

```typescript
export const triggerDisbursementBridge = internalAction({
  args: {
    asOfDate: v.string(),
    lenderId: v.optional(v.id("lenders")),
    limit: v.optional(v.number()),
    providerCode: v.optional(providerCodeValidator),
  },
  handler: async (ctx, args) => {
    const effectiveLimit = args.limit ?? 50;
    const providerCode = args.providerCode ?? "mock_eft";

    // 1. Find eligible entries via runQuery
    const entries = await ctx.runQuery(
      internal.dispersal.disbursementBridge.findEligibleEntriesInternal,
      { asOfDate: args.asOfDate, lenderId: args.lenderId, limit: effectiveLimit }
    );

    // 2. Process each entry sequentially (mutation + action per entry)
    const result: DisbursementBridgeResult = { processed: 0, skipped: 0, failed: 0, transfers: [], errors: [] };

    for (const entry of entries) {
      try {
        // 2a. Create transfer record (mutation)
        const createResult = await ctx.runMutation(
          internal.dispersal.disbursementBridge.processSingleDisbursement,
          { dispersalEntryId: entry._id, providerCode }
        );

        if (createResult.skipped) {
          result.skipped++;
          continue;
        }

        // 2b. Initiate transfer via provider (action)
        await ctx.runAction(
          internal.payments.transfers.mutations.initiateTransferInternal,
          { transferId: createResult.transferId }
        );

        result.processed++;
        result.transfers.push({
          dispersalEntryId: entry._id,
          transferRequestId: createResult.transferId,
          amount: entry.amount,
          lenderId: entry.lenderId,
        });
      } catch (error) {
        result.failed++;
        result.errors.push({
          dispersalEntryId: entry._id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  },
});
```

### T-005: resetFailedEntry

Simple `internalMutation` that resets a failed entry back to pending:

```typescript
export const resetFailedEntry = internalMutation({
  args: {
    dispersalEntryId: v.id("dispersalEntries"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.dispersalEntryId);
    if (!entry) throw new ConvexError("Dispersal entry not found");
    if (entry.status !== "failed") {
      throw new ConvexError(`Can only reset failed entries, current status: "${entry.status}"`);
    }
    await ctx.db.patch(args.dispersalEntryId, {
      status: "pending",
      payoutDate: undefined,
    });
  },
});
```

---

## File Imports You'll Need

```typescript
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import type { CommandSource } from "../engine/types";
import { assertDisbursementAllowed } from "../payments/cashLedger/disbursementGate";
import { providerCodeValidator } from "../payments/transfers/validators";
```

---

## Constraints

- Amount is already in the entry (servicing fee pre-deducted by `createDispersalEntries`). Do NOT recalculate.
- `counterpartyId` is `entry.lenderId` as a string — it's a Convex document ID which is a domain entity ID.
- The bridge is an `internalAction` because it calls `initiateTransferInternal` which is an action.
- `processSingleDisbursement` is an `internalMutation` — it does DB reads/writes only.
- Mock provider validation: check `areMockTransferProvidersEnabled()` for mock_eft/mock_pad providers.
- After `bun check` and `bun typecheck`, run `bunx convex codegen` to regenerate API types.
