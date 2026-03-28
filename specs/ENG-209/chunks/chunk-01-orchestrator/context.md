# Chunk 01 Context: Commitment Deposit Collection

## Overview

Implement the commitment deposit collection flow — when a mortgage application's commitment deposit offer condition is satisfied, collect the deposit from the borrower through unified payment rails. Commitment deposits are NOT obligations — they credit UNAPPLIED_CASH and are held pending application outcome.

## Acceptance Criteria (verbatim from Linear)

- Deposit does NOT create an obligation
- Cash Ledger credits UNAPPLIED_CASH (deposit held pending application outcome)
- Transfer confirmation advances the offer condition state
- Bridges Mortgage Application goal with unified payment rails

## What Already Exists (DO NOT recreate)

1. **Transfer type** `commitment_deposit_collection` is defined in `convex/payments/transfers/types.ts` line 18
2. **Obligation mapping** `TRANSFER_TYPE_TO_OBLIGATION_TYPE['commitment_deposit_collection'] = null` — confirmed no obligation
3. **Cash ledger routing** in `convex/payments/cashLedger/integrations.ts` function `inboundTransferCreditFamily()`:
   - `commitment_deposit_collection` → returns `"UNAPPLIED_CASH"`
4. **`postCashReceiptForTransfer()`** handles all inbound transfers generically — no special handling needed
5. **`publishTransferConfirmed`** effect handler in `convex/engine/effects/transfer.ts` already:
   - Patches settledAt
   - Calls `postCashReceiptForTransfer()` for inbound transfers
   - Calls `handlePipelineLegConfirmed()` for pipeline transfers
6. **`createTransferRequestInternal`** internal mutation (no RBAC) in `convex/payments/transfers/mutations.ts`
7. **`initiateTransferInternal`** internal action (no RBAC) in `convex/payments/transfers/mutations.ts`
8. **Validators** in `convex/payments/transfers/validators.ts`: `directionValidator`, `transferTypeValidator`, `counterpartyTypeValidator`, `providerCodeValidator`

## T-001: Create Deposit Collection Orchestrator

**File:** `convex/payments/transfers/depositCollection.ts`

Create a module that exports functions for orchestrating commitment deposit collection. This follows the same pattern as `startDealClosingPipeline` in mutations.ts but simpler (no multi-leg pipeline).

### Function signature:

```typescript
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import type { CommandSource } from "../../engine/types";

const DEPOSIT_SOURCE: CommandSource = {
  actorType: "system",
  channel: "commitment_deposit_collection",
};

/**
 * Orchestrates commitment deposit collection:
 * 1. Creates a transfer request (inbound, commitment_deposit_collection)
 * 2. Initiates the transfer via the resolved provider
 *
 * Idempotent: uses deterministic key:
 *   - `commitment-deposit:{dealId}` when only dealId is provided
 *   - `commitment-deposit:application:{applicationId}` when only applicationId is provided
 *   - `commitment-deposit:{dealId}:application:{applicationId}` when both are provided.
 */
export const collectCommitmentDeposit = internalAction({
  args: {
    dealId: v.optional(v.id("deals")),
    applicationId: v.optional(v.string()),
    borrowerId: v.id("borrowers"),
    mortgageId: v.id("mortgages"),
    amount: v.number(),
    providerCode: v.optional(/* providerCodeValidator — import from validators */),
  },
  handler: async (ctx, args) => {
    // Validate at least one reference
    if (!args.dealId && !args.applicationId) {
      throw new ConvexError("Either dealId or applicationId is required");
    }

    // Validate amount
    if (!Number.isInteger(args.amount) || args.amount <= 0) {
      throw new ConvexError("Amount must be a positive integer (cents)");
    }

    const referenceId = args.dealId ?? args.applicationId;
    const idempotencyKey = `commitment-deposit:${referenceId}`;
    const providerCode = args.providerCode ?? "manual";

    // Build metadata with applicationId if present
    const metadata: Record<string, unknown> = {};
    if (args.applicationId) {
      metadata.applicationId = args.applicationId;
    }

    // 1. Create transfer request
    const transferId = await ctx.runMutation(
      internal.payments.transfers.mutations.createTransferRequestInternal,
      {
        direction: "inbound" as const,
        transferType: "commitment_deposit_collection" as const,
        amount: args.amount,
        counterpartyType: "borrower" as const,
        counterpartyId: args.borrowerId, // borrowerId is already a domain entity ID (Id<"borrowers">)
        mortgageId: args.mortgageId,
        dealId: args.dealId,
        borrowerId: args.borrowerId,
        providerCode,
        idempotencyKey,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      }
    );

    // 2. Initiate via provider
    await ctx.runAction(
      internal.payments.transfers.mutations.initiateTransferInternal,
      { transferId }
    );

    return { transferId };
  },
});
```

### Key design decisions:
- Uses `internalAction` (not `internalMutation`) because `initiateTransferInternal` is an action (providers make HTTP calls)
- Uses `DEPOSIT_SOURCE` with `actorType: "system"` and `channel: "commitment_deposit_collection"`
- `counterpartyId` receives the `borrowerId` which is an `Id<"borrowers">` — this is a Convex document ID which passes the domain entity ID guard
- No `obligationId` set — commitment deposits are not obligation-backed
- `applicationId` stored in metadata (not a schema field on transferRequests)

### IMPORTANT: The `createTransferRequestInternal` mutation uses its own `PIPELINE_SOURCE` internally, so the deposit source won't be used there. The source on the transfer record will be `{ channel: "scheduler", actorType: "system" }`. This is acceptable for Phase 1.

## T-002: Admin Trigger Mutation

**File:** `convex/payments/transfers/mutations.ts` — add at the end, before the closing

Add a public admin-facing action that wraps the orchestrator:

```typescript
// ── collectCommitmentDepositAdmin ───────────────────────────────────
/**
 * Admin-facing action to trigger commitment deposit collection.
 * Phase 1 fallback: admin triggers deposit collection manually
 * when the offer condition system doesn't exist yet.
 */
export const collectCommitmentDepositAdmin = paymentAction
  .input({
    dealId: v.optional(v.id("deals")),
    applicationId: v.optional(v.string()),
    borrowerId: v.id("borrowers"),
    mortgageId: v.id("mortgages"),
    amount: v.number(),
    providerCode: v.optional(providerCodeValidator),
  })
  .handler(async (ctx, args) => {
    return ctx.runAction(
      internal.payments.transfers.depositCollection.collectCommitmentDeposit,
      {
        dealId: args.dealId,
        applicationId: args.applicationId,
        borrowerId: args.borrowerId,
        mortgageId: args.mortgageId,
        amount: args.amount,
        providerCode: args.providerCode,
      }
    );
  })
  .public();
```

### Pattern reference: This follows the same pattern as `startDealClosingPipeline` — a paymentAction that validates, then delegates to an internal action.

## T-003: Extend publishTransferConfirmed

**File:** `convex/engine/effects/transfer.ts`

Add commitment deposit condition progression logic AFTER the existing `handlePipelineLegConfirmed` call at the end of `publishTransferConfirmed`.

Add this block right before the closing `}` of the `publishTransferConfirmed` handler, after the `handlePipelineLegConfirmed` call:

```typescript
// ── Commitment deposit → offer condition progression (stub) ────
if (transfer.transferType === "commitment_deposit_collection") {
  // TODO(ENG-209): When the offer condition system exists, fire SYSTEM_VERIFIED
  // on the deposit offer condition to trigger cascadeUnlock:
  //
  // await ctx.scheduler.runAfter(0, internal.engine.transition.executeTransition, {
  //   entityType: 'offerCondition',
  //   entityId: conditionId,  // resolve from transfer.metadata or dealId
  //   eventType: 'SYSTEM_VERIFIED',
  //   source: args.source,
  // });
  console.info(
    `[publishTransferConfirmed] Commitment deposit confirmed for transfer ${args.entityId}. ` +
    "Offer condition progression pending offer condition system implementation."
  );
}
```

### Placement: After `await handlePipelineLegConfirmed(ctx, transfer);` at the end of the handler.

## T-004: Tests

**File:** `convex/payments/transfers/__tests__/depositCollection.test.ts`

Follow the pattern from `mutations.test.ts` — test pure domain logic without requiring full convex-test setup.

```typescript
/**
 * Deposit collection tests — validation logic and config shape.
 *
 * The actual collectCommitmentDeposit action requires full convex-test setup.
 * These tests cover the pure domain logic: idempotency key format, source shape,
 * config validation, and transfer type mapping.
 */
import { describe, expect, it } from "vitest";
import { TRANSFER_TYPE_TO_OBLIGATION_TYPE } from "../types";

describe("commitment deposit collection", () => {
  // ── Transfer type configuration ──────────────────────────
  describe("transfer type taxonomy", () => {
    it("commitment_deposit_collection maps to null obligation type", () => {
      expect(TRANSFER_TYPE_TO_OBLIGATION_TYPE.commitment_deposit_collection).toBeNull();
    });

    it("commitment_deposit_collection is in the inbound types", () => {
      // Already tested in types.test.ts, but asserting here for deposit-specific coverage
      const { INBOUND_TRANSFER_TYPES } = require("../types");
      expect(INBOUND_TRANSFER_TYPES).toContain("commitment_deposit_collection");
    });
  });

  // ── Idempotency key format ───────────────────────────────
  describe("idempotency key format", () => {
    function buildDepositIdempotencyKey(referenceId: string): string {
      return `commitment-deposit:${referenceId}`;
    }

    it("uses dealId when provided", () => {
      const key = buildDepositIdempotencyKey("deal_abc123");
      expect(key).toBe("commitment-deposit:deal_abc123");
    });

    it("uses applicationId as fallback", () => {
      const key = buildDepositIdempotencyKey("app_xyz789");
      expect(key).toBe("commitment-deposit:app_xyz789");
    });

    it("keys are deterministic", () => {
      const key1 = buildDepositIdempotencyKey("deal_abc123");
      const key2 = buildDepositIdempotencyKey("deal_abc123");
      expect(key1).toBe(key2);
    });

    it("keys differ for different references", () => {
      const key1 = buildDepositIdempotencyKey("deal_abc123");
      const key2 = buildDepositIdempotencyKey("deal_def456");
      expect(key1).not.toBe(key2);
    });
  });

  // ── Source shape ──────────────────────────────────────────
  describe("deposit source shape", () => {
    const DEPOSIT_SOURCE = {
      actorType: "system" as const,
      channel: "commitment_deposit_collection",
    };

    it("has system actor type", () => {
      expect(DEPOSIT_SOURCE.actorType).toBe("system");
    });

    it("has commitment_deposit_collection channel", () => {
      expect(DEPOSIT_SOURCE.channel).toBe("commitment_deposit_collection");
    });
  });

  // ── Config validation ────────────────────────────────────
  describe("config validation", () => {
    function validateDepositConfig(config: {
      dealId?: string;
      applicationId?: string;
      amount: number;
    }): { valid: boolean; error?: string } {
      if (!config.dealId && !config.applicationId) {
        return { valid: false, error: "Either dealId or applicationId is required" };
      }
      if (!Number.isInteger(config.amount) || config.amount <= 0) {
        return { valid: false, error: "Amount must be a positive integer (cents)" };
      }
      return { valid: true };
    }

    it("accepts config with dealId", () => {
      expect(validateDepositConfig({ dealId: "deal_abc", amount: 50000 })).toEqual({ valid: true });
    });

    it("accepts config with applicationId", () => {
      expect(validateDepositConfig({ applicationId: "app_abc", amount: 50000 })).toEqual({ valid: true });
    });

    it("accepts config with both references", () => {
      expect(validateDepositConfig({ dealId: "deal_abc", applicationId: "app_abc", amount: 50000 })).toEqual({ valid: true });
    });

    it("rejects config with neither reference", () => {
      const result = validateDepositConfig({ amount: 50000 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("dealId or applicationId");
    });

    it("rejects zero amount", () => {
      const result = validateDepositConfig({ dealId: "deal_abc", amount: 0 });
      expect(result.valid).toBe(false);
    });

    it("rejects negative amount", () => {
      const result = validateDepositConfig({ dealId: "deal_abc", amount: -100 });
      expect(result.valid).toBe(false);
    });

    it("rejects float amount", () => {
      const result = validateDepositConfig({ dealId: "deal_abc", amount: 100.5 });
      expect(result.valid).toBe(false);
    });
  });

  // ── Metadata shape ───────────────────────────────────────
  describe("metadata for applicationId", () => {
    function buildDepositMetadata(applicationId?: string): Record<string, unknown> | undefined {
      if (!applicationId) return undefined;
      return { applicationId };
    }

    it("includes applicationId when provided", () => {
      expect(buildDepositMetadata("app_abc")).toEqual({ applicationId: "app_abc" });
    });

    it("returns undefined when no applicationId", () => {
      expect(buildDepositMetadata()).toBeUndefined();
    });
  });
});
```

## T-005: Quality Gate

Run these commands and ensure all pass:
```bash
bun check
bun typecheck
bunx convex codegen
```

## Important Constraints

- **No `any` types** — use explicit types throughout
- **Use `Id<"borrowers">` not `v.string()`** for borrowerId in the orchestrator args
- **Use `providerCodeValidator`** from validators.ts for providerCode validation
- **Import internal API** via `import { internal } from "../../_generated/api"`
- **The offer condition system does not exist yet** — the condition progression is a stub/TODO
- **`applicationId` goes in metadata**, not as a schema field (transferRequests schema doesn't have it)
- **The `createTransferRequestInternal` counterpartyId** field expects a string, and Convex `Id<"borrowers">` is a string, so it passes the domain entity ID guard (it's not a WorkOS auth ID pattern)
