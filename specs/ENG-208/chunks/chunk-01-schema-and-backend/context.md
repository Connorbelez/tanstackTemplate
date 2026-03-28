# Chunk 01 Context: Schema + Backend Implementation

## Goal
When a deal enters the `locked` state (via `DEAL_LOCKED` event), automatically collect a locking fee from the buyer through unified payment rails. Locking fees are NOT obligations — they credit `UNAPPLIED_CASH` (not `BORROWER_RECEIVABLE`) and have no obligation reference.

## Acceptance Criteria
- Locking fee does NOT create an obligation (not a periodic contractual debt)
- Cash Ledger credits UNAPPLIED_CASH, not BORROWER_RECEIVABLE
- Fee collection failure may block deal from proceeding (configurable) — **Phase 1: log warning, don't block**
- Transfer carries `dealId` reference for audit trail
- Amount is configured per deal type, not hardcoded

---

## T-001: Add `lockingFeeAmount` to deals schema

**File:** `convex/schema.ts`

The `deals` table currently has these fields (lines 880-899):
```typescript
deals: defineTable({
    // ─── Governed Transitions fields ───
    status: v.string(),
    machineContext: v.optional(v.any()),
    lastTransitionAt: v.optional(v.number()),

    // ─── Domain fields ───
    mortgageId: v.id("mortgages"),
    buyerId: v.string(),
    sellerId: v.string(),
    fractionalShare: v.number(),
    closingDate: v.optional(v.number()),
    lawyerId: v.optional(v.string()),
    reservationId: v.optional(v.id("ledger_reservations")),
    lawyerType: v.optional(
        v.union(v.literal("platform_lawyer"), v.literal("guest_lawyer"))
    ),
    createdAt: v.number(),
    createdBy: v.string(),
})
    .index("by_status", ["status"])
```

**Add** `lockingFeeAmount: v.optional(v.number())` to the domain fields section. It's optional because not all deals may have locking fees. The value is in safe-integer cents.

After this change, run `bunx convex codegen` to verify.

---

## T-002: Implement `collectLockingFee` effect

**File:** `convex/engine/effects/dealClosingEffects.ts`

### Current file structure
The file already imports:
```typescript
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";
```

And defines:
```typescript
const dealEffectPayloadValidator = {
    ...effectPayloadValidator,
    entityId: v.id("deals"),
    entityType: v.literal("deal"),
};
```

### Pattern to follow
The existing pipeline pattern (from `convex/payments/transfers/pipeline.ts`) shows how to:
1. Call `internal.deals.queries.getInternalDeal` to get the deal
2. Call `internal.payments.transfers.mutations.createTransferRequestInternal` to create a transfer
3. Call `internal.payments.transfers.mutations.initiateTransferInternal` to initiate it

### Implementation
Add a new export `collectLockingFee` as an `internalAction` with `dealEffectPayloadValidator` args.

The handler should:
1. Fetch the deal via `ctx.runQuery(internal.deals.queries.getInternalDeal, { dealId: args.entityId })`
2. If deal not found, log error and return (don't throw — effects should be resilient)
3. If `deal.lockingFeeAmount` is undefined/null or <= 0, log info "No locking fee configured" and return
4. Build idempotency key: `locking-fee:${args.entityId}`
5. Create the transfer via `ctx.runMutation(internal.payments.transfers.mutations.createTransferRequestInternal, { ... })`
   - `direction: "inbound"`
   - `transferType: "locking_fee_collection"`
   - `amount: deal.lockingFeeAmount`
   - `counterpartyType: "borrower"` (buyer is a borrower in counterparty taxonomy)
   - `counterpartyId: deal.buyerId`
   - `mortgageId: deal.mortgageId`
   - `dealId: args.entityId`
   - `providerCode: "manual"` (Phase 1 default — provider registry resolution is Phase 2)
   - `idempotencyKey: \`locking-fee:${args.entityId}\``
6. Initiate the transfer via `ctx.runAction(internal.payments.transfers.mutations.initiateTransferInternal, { transferId })`
7. Log success

### Required imports to add
```typescript
import { internal } from "../../_generated/api";
```

---

## T-003: Register effect in registry

**File:** `convex/engine/effects/registry.ts`

Add to the registry object, in the "Deal Closing — effects" section (after line 38):
```typescript
collectLockingFee: internal.engine.effects.dealClosingEffects.collectLockingFee,
```

---

## T-004: Add action to deal machine

**File:** `convex/engine/machines/deal.machine.ts`

Two changes:

1. **Add to `actions` object in `setup()`** (line ~55, after `revokeLawyerAccess`):
```typescript
collectLockingFee: noopAction,
```

2. **Add to `DEAL_LOCKED` transition's actions array** (line ~68-72):
```typescript
DEAL_LOCKED: {
    target: "lawyerOnboarding",
    actions: [
        "reserveShares",
        "notifyAllParties",
        "createDocumentPackage",
        "collectLockingFee",
    ],
},
```

The effect runs as a scheduled action (via Transition Engine's `extractScheduledEffects + scheduleEffects` pipeline), so it executes asynchronously after the state transition commits. This means fee collection failure does NOT block the deal from progressing to `lawyerOnboarding` — matching Phase 1 requirements.

---

## Key Design Notes

- **Effects are `internalAction`s** — they can call both mutations and actions
- **Source is PIPELINE_SOURCE** — the internal mutations use `{ channel: "scheduler", actorType: "system" }` as source, so we don't need to pass one
- **Cash ledger mapping already exists** — `locking_fee_collection` → `UNAPPLIED_CASH` credit is already wired in `integrations.ts`
- **Idempotency** — the `createTransferRequestInternal` checks for existing transfers with the same idempotency key
- **No obligation created** — `obligationId` is omitted from the transfer creation call
- **`buyerId` is a string** — not a typed ID, it's the domain entity ID stored on the deal
