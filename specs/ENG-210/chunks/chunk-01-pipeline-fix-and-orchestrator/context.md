# Chunk 01 Context: Pipeline lenderId Fix + Principal Return Module

## Goal
Fix the critical `lenderId` gap in the multi-leg deal closing pipeline's Leg 2, then create the investor principal return orchestrator module and admin action.

---

## Critical Bug: Leg 2 Missing `lenderId`

When Leg 2 (outbound `deal_seller_payout`) confirms, `publishTransferConfirmed` calls `postLenderPayoutForTransfer`, which requires `lenderId`:

```typescript
// convex/payments/cashLedger/integrations.ts
if (!transfer.lenderId) {
    throw new ConvexError(
        `Transfer ${args.transferRequestId} has no lenderId for lender payout`
    );
}
```

Currently, `createAndInitiateLeg2` does NOT pass `lenderId` to `createTransferRequestInternal`. The fix requires threading `lenderId` through the entire pipeline chain:

1. `startDealClosingPipeline` → reads `deal.lenderId` from the deal doc
2. `createDealClosingPipeline` → stores `lenderId` in Leg 1 metadata
3. `handlePipelineLegConfirmed` → extracts `lenderId` from Leg 1 metadata
4. `createAndInitiateLeg2` → passes `lenderId` to `createTransferRequestInternal`

---

## File-by-File Implementation Details

### T-001 & T-002: `convex/payments/transfers/pipeline.types.ts`

**Current `DealClosingLeg1Metadata`:**
```typescript
export interface DealClosingLeg1Metadata {
    leg2Amount: number;
    pipelineType: "deal_closing";
    sellerId: string;
}
```

**Target:**
```typescript
export interface DealClosingLeg1Metadata {
    leg2Amount: number;
    lenderId: string;  // Id<"lenders"> serialized — needed for Leg 2 cash posting
    pipelineType: "deal_closing";
    sellerId: string;
}
```

**Update `extractLeg1Metadata`:** Add validation for `lenderId` (typeof string, non-empty). Return it in the result object.

### T-003: `convex/payments/transfers/pipeline.ts` — `createDealClosingPipeline`

**Current args:** `dealId, pipelineId, buyerId, sellerId, mortgageId, leg1Amount, leg2Amount, providerCode`

**Add:** `lenderId: v.optional(v.id("lenders"))` (optional because deals pre-approval may not have lenderId)

**Update Leg 1 metadata:**
```typescript
metadata: {
    pipelineType: "deal_closing",
    sellerId: args.sellerId,
    leg2Amount: args.leg2Amount,
    lenderId: args.lenderId,  // NEW — Id stored as string in metadata blob
} satisfies DealClosingLeg1Metadata,
```

Note: `v.id("lenders")` is a string at runtime. The metadata `v.record(v.string(), v.any())` accepts it.

### T-004: `convex/payments/transfers/pipeline.ts` — `createAndInitiateLeg2`

**Current args:** `pipelineId, dealId, sellerId, mortgageId, leg2Amount, providerCode`

**Add:** `lenderId: v.optional(v.string())`

**Pass to `createTransferRequestInternal`:** Add `lenderId: args.lenderId` in the mutation call.

### T-005: `convex/engine/effects/transfer.ts` — `handlePipelineLegConfirmed`

**Current Leg 1 → Leg 2 scheduler call:**
```typescript
await ctx.scheduler.runAfter(
    0,
    internal.payments.transfers.pipeline.createAndInitiateLeg2,
    {
        pipelineId: transfer.pipelineId,
        dealId: transfer.dealId,
        sellerId: leg1Meta.sellerId,
        mortgageId: transfer.mortgageId,
        leg2Amount: leg1Meta.leg2Amount,
        providerCode: assertProviderCode(transfer.providerCode),
    }
);
```

**Add:** `lenderId: leg1Meta.lenderId` to the scheduler args.

### T-006: `convex/payments/transfers/mutations.ts` — `startDealClosingPipeline`

**Current pipeline creation call:**
```typescript
await ctx.runAction(
    internal.payments.transfers.pipeline.createDealClosingPipeline,
    {
        dealId: args.dealId,
        pipelineId,
        buyerId: deal.buyerId,
        sellerId: deal.sellerId,
        mortgageId: deal.mortgageId,
        leg1Amount: args.leg1Amount,
        leg2Amount,
        providerCode,
    }
);
```

**Add:** `lenderId: deal.lenderId` — the deal doc already has this field (`v.optional(v.id("lenders"))`). It will be undefined for pre-approval deals.

### T-007: Create `convex/payments/transfers/principalReturn.logic.ts`

Pure logic module — no Convex imports, fully testable.

```typescript
/**
 * Computes the net principal return amount after proration adjustment.
 * All amounts in cents (integer).
 */
export function computeProrationAdjustedAmount(
    principalAmount: number,
    prorationAdjustment: number,
): number {
    const adjusted = principalAmount + prorationAdjustment;
    if (!Number.isInteger(adjusted) || adjusted <= 0) {
        throw new Error(
            `Invalid prorated amount: ${adjusted} (principal: ${principalAmount}, adjustment: ${prorationAdjustment})`
        );
    }
    return adjusted;
}

export function buildPrincipalReturnIdempotencyKey(
    dealId: string,
    sellerId: string,
): string {
    return `principal-return:${dealId}:${sellerId}`;
}
```

### T-008: Create `convex/payments/transfers/principalReturn.ts`

Internal action orchestrator. Follow the pattern from `depositCollection.ts`:

```typescript
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { computeProrationAdjustedAmount, buildPrincipalReturnIdempotencyKey } from "./principalReturn.logic";
import { providerCodeValidator } from "./validators";

export const createPrincipalReturn = internalAction({
    args: {
        dealId: v.id("deals"),
        sellerId: v.string(),
        lenderId: v.id("lenders"),
        mortgageId: v.id("mortgages"),
        principalAmount: v.number(),
        prorationAdjustment: v.number(),
        providerCode: providerCodeValidator,
        bankAccountRef: v.optional(v.string()),
        pipelineId: v.optional(v.string()),
        legNumber: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const amount = computeProrationAdjustedAmount(
            args.principalAmount,
            args.prorationAdjustment,
        );
        const idempotencyKey = buildPrincipalReturnIdempotencyKey(
            args.dealId, args.sellerId,
        );

        const transferId = await ctx.runMutation(
            internal.payments.transfers.mutations.createTransferRequestInternal,
            {
                direction: "outbound",
                transferType: "lender_principal_return",
                amount,
                counterpartyType: "investor",
                counterpartyId: args.sellerId,
                mortgageId: args.mortgageId,
                dealId: args.dealId,
                lenderId: args.lenderId,
                providerCode: args.providerCode,
                bankAccountRef: args.bankAccountRef,
                idempotencyKey,
                pipelineId: args.pipelineId,
                legNumber: args.legNumber,
            },
        );

        try {
            await ctx.runAction(
                internal.payments.transfers.mutations.initiateTransferInternal,
                { transferId },
            );
        } catch (error) {
            console.error(
                `[createPrincipalReturn] initiateTransferInternal failed; transferId=${transferId}`,
                error,
            );
            throw error;
        }

        return { transferId };
    },
});
```

### T-009: Add `returnInvestorPrincipal` admin action to `mutations.ts`

Follow the `collectCommitmentDepositAdmin` pattern:

```typescript
export const returnInvestorPrincipal = paymentAction
    .input({
        dealId: v.id("deals"),
        sellerId: v.string(),
        lenderId: v.id("lenders"),
        mortgageId: v.id("mortgages"),
        principalAmount: v.number(),
        prorationAdjustment: v.optional(v.number()),
        providerCode: v.optional(providerCodeValidator),
        bankAccountRef: v.optional(v.string()),
    })
    .handler(async (ctx, args) => {
        // Validate deal exists and is in a post-close state
        const deal = await ctx.runQuery(
            internal.deals.queries.getInternalDeal,
            { dealId: args.dealId },
        );
        if (deal.status !== "confirmed") {
            throw new ConvexError(
                `Deal must be in "confirmed" status for principal return, currently: "${deal.status}"`
            );
        }

        // Check idempotency
        const idempotencyKey = buildPrincipalReturnIdempotencyKey(
            args.dealId, args.sellerId,
        );
        const existing = await ctx.runQuery(
            internal.payments.transfers.queries.getTransferByIdempotencyKeyInternal,
            { idempotencyKey },
        );
        if (existing && existing.transferType === "lender_principal_return") {
            if (["confirmed", "pending", "processing"].includes(existing.status)) {
                return { transferId: existing._id, alreadyExists: true };
            }
            if (existing.status === "failed") {
                throw new ConvexError(
                    `A principal return transfer exists but failed (${existing._id}). Use the retry flow or cancel before trying again.`
                );
            }
        }

        const result = await ctx.runAction(
            internal.payments.transfers.principalReturn.createPrincipalReturn,
            {
                dealId: args.dealId,
                sellerId: args.sellerId,
                lenderId: args.lenderId,
                mortgageId: args.mortgageId,
                principalAmount: args.principalAmount,
                prorationAdjustment: args.prorationAdjustment ?? 0,
                providerCode: args.providerCode ?? "manual",
                bankAccountRef: args.bankAccountRef,
            },
        );

        return { ...result, alreadyExists: false };
    })
    .public();
```

Import `buildPrincipalReturnIdempotencyKey` from `./principalReturn.logic`.

---

## Key Conventions

- **No `any` types.** Use explicit types everywhere.
- **`paymentAction` builder** for RBAC-gated admin actions (requires `payment:manage` permission).
- **`internalAction`** for system-triggered orchestrators (no RBAC).
- **Idempotency**: `principal-return:{dealId}:{sellerId}`.
- **Provider default**: `"manual"` for Phase 1.
- **Proration**: taken as input (integer cents). Admin provides the adjusted amount. Automated calculation is deferred.
- **Source**: `{ actorType: 'system', channel: 'principal_return' }` for orchestrator, viewer-based for admin action.

## Quality Gate

After completing all tasks in this chunk:
1. `bunx convex codegen` — regenerate types
2. `bun check` — lint + format
3. `bun typecheck` — type checking
