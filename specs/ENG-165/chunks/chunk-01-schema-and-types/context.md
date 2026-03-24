# Chunk 1 Context: Schema & Types

## Goal
Extend the stub `transferRequests` table with fields needed for transfer reconciliation, create a `transferHealingAttempts` tracking table, and define TypeScript types for the 4 reconciliation checks + self-healing.

## Current State

### transferRequests table (stub at convex/schema.ts ~line 1387)
```typescript
transferRequests: defineTable({
    status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
    ),
    createdAt: v.number(),
}),
```

This is a stub (comment says "populated by ENG-190"). It needs reconciliation fields.

### cash_ledger_journal_entries already has transferRequestId
The journal entries table already has:
- `transferRequestId: v.optional(v.id("transferRequests"))` (line ~1081)
- `.index("by_transfer_request", ["transferRequestId", "sequenceNumber"])` (line ~1106)

## T-001: Extend transferRequests Schema

Add these fields and status values to the existing `transferRequests` table:

```typescript
transferRequests: defineTable({
    status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("confirmed"),    // NEW - transfer confirmed by provider
        v.literal("reversed"),     // NEW - transfer reversed by provider
        v.literal("failed"),
        v.literal("cancelled")
    ),
    // NEW fields for reconciliation
    direction: v.optional(v.union(v.literal("inbound"), v.literal("outbound"))),
    transferType: v.optional(v.string()),  // e.g. "borrower_interest_collection", "lender_dispersal_payout"
    amount: v.optional(v.number()),        // safe-integer cents
    currency: v.optional(v.string()),      // default "CAD"
    // Cross-references
    mortgageId: v.optional(v.id("mortgages")),
    obligationId: v.optional(v.id("obligations")),
    lenderId: v.optional(v.id("lenders")),
    borrowerId: v.optional(v.id("borrowers")),
    dispersalEntryId: v.optional(v.id("dispersalEntries")),
    // Temporal
    confirmedAt: v.optional(v.number()),   // Unix ms when confirmed
    reversedAt: v.optional(v.number()),    // Unix ms when reversed
    createdAt: v.number(),
})
    .index("by_status", ["status"])
    .index("by_status_and_direction", ["status", "direction"])
    .index("by_mortgage", ["mortgageId", "status"])
    .index("by_obligation", ["obligationId"])
    .index("by_dispersal_entry", ["dispersalEntryId"]),
```

**IMPORTANT**: All new fields are `v.optional(...)` to avoid breaking the existing stub. This is additive and non-breaking.

## T-002: Create transferHealingAttempts Table

Follow the exact pattern from `dispersalHealingAttempts` (schema.ts ~line 1001):

```typescript
// Existing pattern to follow:
dispersalHealingAttempts: defineTable({
    obligationId: v.id("obligations"),
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
    .index("by_obligation", ["obligationId"])
    .index("by_status", ["status"]),
```

Create `transferHealingAttempts`:

```typescript
transferHealingAttempts: defineTable({
    transferRequestId: v.id("transferRequests"),
    attemptCount: v.number(),
    lastAttemptAt: v.number(),         // Unix ms
    escalatedAt: v.optional(v.number()), // Unix ms, set on SUSPENSE escalation
    status: v.union(
        v.literal("retrying"),
        v.literal("escalated"),
        v.literal("resolved")
    ),
    createdAt: v.number(),             // Unix ms
})
    .index("by_transfer_request", ["transferRequestId"])
    .index("by_status", ["status"]),
```

Place it near the `dispersalHealingAttempts` table in schema.ts (around line 1014).

## T-003: Create Transfer Reconciliation Types

Create file: `convex/payments/cashLedger/transferReconciliation.ts`

Define item types following the existing pattern from reconciliationSuite.ts (lines 30-87):

```typescript
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { ReconciliationCheckResult, ReconciliationSuiteOptions } from "./reconciliationSuite";

// Re-export for convenience
export type { ReconciliationCheckResult, ReconciliationSuiteOptions };

// ── Constants ─────────────────────────────────────────────────
const MS_PER_DAY = 86_400_000;
const ORPHAN_THRESHOLD_MS = 5 * 60_000; // 5 minutes (per spec)

// ── Item Types ───────────────────────────────────────────────

export interface OrphanedConfirmedTransferItem {
    transferRequestId: Id<"transferRequests">;
    direction: "inbound" | "outbound";
    amount: number;                           // cents
    expectedIdempotencyKey: string;
    mortgageId?: Id<"mortgages">;
    confirmedAt: number;
    ageDays: number;
}

export interface OrphanedReversedTransferItem {
    transferRequestId: Id<"transferRequests">;
    direction: "inbound" | "outbound";
    amount: number;
    expectedIdempotencyKey: string;
    mortgageId?: Id<"mortgages">;
    reversedAt: number;
    ageDays: number;
}

export interface StaleOutboundTransferItem {
    transferRequestId: Id<"transferRequests">;
    dispersalEntryId: Id<"dispersalEntries">;
    dispersalStatus: string;
    amount: number;
    confirmedAt: number;
    ageDays: number;
}

export interface TransferAmountMismatchItem {
    transferRequestId: Id<"transferRequests">;
    journalEntryId: Id<"cash_ledger_journal_entries">;
    transferAmount: number;
    journalAmount: number;
    differenceCents: number;
}
```

**Key pattern**: Use `buildResult()` helper from reconciliationSuite.ts — import and reuse it. If it's not exported, replicate the pattern locally.

**Idempotency key convention** (from v2 Notion revision):
- Inbound confirmed: `cash-ledger:cash-received:transfer:{transferRequestId}`
- Outbound confirmed (payout): `cash-ledger:lender-payout-sent:transfer:{transferRequestId}`
- Reversed: `cash-ledger:reversal:transfer:{transferRequestId}`

Use `buildIdempotencyKey` from `types.ts`:
```typescript
import { buildIdempotencyKey } from "./types";
// buildIdempotencyKey("cash-received", "transfer", transferRequestId)
// → "cash-ledger:cash-received:transfer:{id}"
```

## T-004: Create Transfer Healing Types

Create file: `convex/payments/cashLedger/transferHealingTypes.ts`

Follow the `convex/dispersal/selfHealingTypes.ts` pattern exactly:

```typescript
import type { Id } from "../../_generated/dataModel";

export const MAX_TRANSFER_HEALING_ATTEMPTS = 3;

export interface TransferHealingCandidate {
    transferRequestId: Id<"transferRequests">;
    direction: "inbound" | "outbound";
    amount: number;
    mortgageId?: Id<"mortgages">;
    obligationId?: Id<"obligations">;
    confirmedAt: number;
}

export interface TransferHealingResult {
    candidatesFound: number;
    checkedAt: number;
    escalated: number;
    retriggered: number;
}
```

## T-005: Verify Schema Changes

Run:
1. `bunx convex codegen` — must pass
2. `bun typecheck` — must pass

## File Location Rules
- Schema changes: `convex/schema.ts`
- New types: `convex/payments/cashLedger/transferReconciliation.ts` (check functions will be added in Chunk 2)
- Healing types: `convex/payments/cashLedger/transferHealingTypes.ts`
- DO NOT create any functions yet — only types and schema

## Existing Pattern References
- `convex/payments/cashLedger/reconciliationSuite.ts` — ReconciliationCheckResult<T>, buildResult(), ageDays(), ReconciliationSuiteOptions
- `convex/dispersal/selfHealingTypes.ts` — HealingCandidate, HealingResult, MAX_HEALING_ATTEMPTS
- `convex/payments/cashLedger/types.ts` — buildIdempotencyKey(), CashEntryType, CashAccountFamily
