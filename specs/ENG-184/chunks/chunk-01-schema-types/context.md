# Chunk 1 Context: Schema & Types

## Goal
Define the core transfer domain types, Convex validators, and evolve the existing `transferRequests` table stub to match the spec.

---

## T-001: Create `convex/payments/transfers/types.ts`

Define the following types. These are pure TypeScript types — no Convex imports, no runtime code.

```typescript
// Transfer directions
export type TransferDirection = 'inbound' | 'outbound';

// Inbound transfer types
export const INBOUND_TRANSFER_TYPES = [
  'borrower_interest_collection',
  'borrower_principal_collection',
  'borrower_late_fee_collection',
  'borrower_arrears_cure',
  'locking_fee_collection',
  'commitment_deposit_collection',
  'deal_principal_transfer',
] as const;

// Outbound transfer types
export const OUTBOUND_TRANSFER_TYPES = [
  'lender_dispersal_payout',
  'lender_principal_return',
  'deal_seller_payout',
] as const;

export type InboundTransferType = typeof INBOUND_TRANSFER_TYPES[number];
export type OutboundTransferType = typeof OUTBOUND_TRANSFER_TYPES[number];
export type TransferType = InboundTransferType | OutboundTransferType;

// All transfer types combined for runtime validation
export const ALL_TRANSFER_TYPES = [...INBOUND_TRANSFER_TYPES, ...OUTBOUND_TRANSFER_TYPES] as const;

// Counterparty types
export type CounterpartyType = 'borrower' | 'lender' | 'investor' | 'trust';

// Canonical provider codes
export const PROVIDER_CODES = [
  'manual',
  'pad_vopay',
  'pad_rotessa',
  'eft_vopay',
  'e_transfer',
  'wire',
  'plaid_transfer',
] as const;

export type ProviderCode = typeof PROVIDER_CODES[number];

// Transfer statuses (aligned with state machine)
export const TRANSFER_STATUSES = [
  'initiated',
  'pending',
  'processing',
  'confirmed',
  'failed',
  'cancelled',
  'reversed',
] as const;

export type TransferStatus = typeof TRANSFER_STATUSES[number];

// Legacy statuses from ENG-190 stub — kept for backward compat, NOT used by machine
export const LEGACY_TRANSFER_STATUSES = ['approved', 'completed'] as const;
export type LegacyTransferStatus = typeof LEGACY_TRANSFER_STATUSES[number];

// Direction → TransferType guard
export function isInboundTransferType(t: TransferType): t is InboundTransferType {
  return (INBOUND_TRANSFER_TYPES as readonly string[]).includes(t);
}

export function isOutboundTransferType(t: TransferType): t is OutboundTransferType {
  return (OUTBOUND_TRANSFER_TYPES as readonly string[]).includes(t);
}
```

**Important**: The `CommandSource` interface from `convex/engine/types.ts` is reused as the source type for transfers (Decision D2 from the implementation plan). Do NOT introduce the spec's `{ type, actor, channel }` shape.

---

## T-002: Create `convex/payments/transfers/validators.ts`

Create Convex validators that mirror the types above. Import from `convex/values` (Convex's validator library).

```typescript
import { v } from "convex/values";

export const directionValidator = v.union(
  v.literal('inbound'),
  v.literal('outbound'),
);

export const inboundTransferTypeValidator = v.union(
  v.literal('borrower_interest_collection'),
  v.literal('borrower_principal_collection'),
  v.literal('borrower_late_fee_collection'),
  v.literal('borrower_arrears_cure'),
  v.literal('locking_fee_collection'),
  v.literal('commitment_deposit_collection'),
  v.literal('deal_principal_transfer'),
);

export const outboundTransferTypeValidator = v.union(
  v.literal('lender_dispersal_payout'),
  v.literal('lender_principal_return'),
  v.literal('deal_seller_payout'),
);

export const transferTypeValidator = v.union(
  // Inbound
  v.literal('borrower_interest_collection'),
  v.literal('borrower_principal_collection'),
  v.literal('borrower_late_fee_collection'),
  v.literal('borrower_arrears_cure'),
  v.literal('locking_fee_collection'),
  v.literal('commitment_deposit_collection'),
  v.literal('deal_principal_transfer'),
  // Outbound
  v.literal('lender_dispersal_payout'),
  v.literal('lender_principal_return'),
  v.literal('deal_seller_payout'),
);

export const counterpartyTypeValidator = v.union(
  v.literal('borrower'),
  v.literal('lender'),
  v.literal('investor'),
  v.literal('trust'),
);

export const providerCodeValidator = v.union(
  v.literal('manual'),
  v.literal('pad_vopay'),
  v.literal('pad_rotessa'),
  v.literal('eft_vopay'),
  v.literal('e_transfer'),
  v.literal('wire'),
  v.literal('plaid_transfer'),
);

// Transfer status: includes both spec statuses AND legacy statuses
export const transferStatusValidator = v.union(
  // Spec statuses (used by transfer state machine)
  v.literal('initiated'),
  v.literal('pending'),
  v.literal('processing'),
  v.literal('confirmed'),
  v.literal('failed'),
  v.literal('cancelled'),
  v.literal('reversed'),
  // LEGACY (ENG-190 stub) — not used by transfer state machine. TODO: migrate
  v.literal('approved'),
  v.literal('completed'),
);
```

---

## T-003: Evolve `transferRequests` Table in Schema

**Current state** (lines 1420-1449 of `convex/schema.ts`):
```typescript
transferRequests: defineTable({
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("processing"),
    v.literal("completed"),
    v.literal("confirmed"),
    v.literal("reversed"),
    v.literal("failed"),
    v.literal("cancelled")
  ),
  direction: v.optional(v.union(v.literal("inbound"), v.literal("outbound"))),
  transferType: v.optional(v.string()),
  amount: v.optional(v.number()),
  currency: v.optional(v.string()),
  mortgageId: v.optional(v.id("mortgages")),
  obligationId: v.optional(v.id("obligations")),
  lenderId: v.optional(v.id("lenders")),
  borrowerId: v.optional(v.id("borrowers")),
  dispersalEntryId: v.optional(v.id("dispersalEntries")),
  confirmedAt: v.optional(v.number()),
  reversedAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_status_and_direction", ["status", "direction"])
  .index("by_mortgage", ["mortgageId", "status"])
  .index("by_obligation", ["obligationId"])
  .index("by_dispersal_entry", ["dispersalEntryId"])
  .index("by_lender_and_status", ["lenderId", "status"]),
```

**Required changes:**
1. Add `v.literal("initiated")` to the status union (machine initial state)
2. Add GT fields: `machineContext`, `lastTransitionAt`
3. Add transfer identity fields: `counterpartyType`, `counterpartyId`, `bankAccountRef`
4. Add provider fields: `providerCode`, `providerRef`
5. Add idempotency/audit fields: `idempotencyKey`, `source` (using existing `sourceValidator`)
6. Add settlement fields: `settledAt`, `failedAt`, `failureReason`, `failureCode`, `reversalRef`
7. Add multi-leg fields: `pipelineId`, `legNumber`
8. Add cross-reference fields: `dealId`, `planEntryId`, `collectionAttemptId`
9. Add metadata field
10. Add new indexes: `by_idempotency`, `by_direction_and_type`, `by_counterparty`, `by_deal`, `by_collection_attempt`, `by_pipeline`, `by_provider_ref`

**Critical rule**: All NEW fields must be `v.optional(...)` to preserve backward compatibility with existing stub records. The existing fields stay as-is.

**Import the `sourceValidator` from `convex/engine/validators.ts`** — this is the CommandSource validator (Decision D2). The current `sourceValidator`:
```typescript
export const sourceValidator = v.object({
  channel: channelValidator,
  actorId: v.optional(v.string()),
  actorType: v.optional(actorTypeValidator),
  ip: v.optional(v.string()),
  sessionId: v.optional(v.string()),
});
```

**Add comments** on legacy statuses:
```typescript
v.literal("approved"),    // LEGACY (ENG-190 stub) — not used by transfer state machine. TODO: migrate
v.literal("completed"),   // LEGACY (ENG-190 stub) — not used by transfer state machine. TODO: migrate
```

After editing, run `bunx convex codegen` to verify the schema compiles.
