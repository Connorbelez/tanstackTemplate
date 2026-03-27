# Chunk 2 Context: State Machine & Registration

## Goal
Create the transfer lifecycle state machine and register `transfer` as a governed entity type across all engine registration points.

---

## T-004: Create `convex/engine/machines/transfer.machine.ts`

Follow the EXACT pattern from `collectionAttempt.machine.ts`:

```typescript
// convex/engine/machines/collectionAttempt.machine.ts pattern:
import { assign, setup } from "xstate";

export const COLLECTION_ATTEMPT_MACHINE_VERSION = "1.1.0";

export const collectionAttemptMachine = setup({
  types: {
    context: {} as { attemptId: string; retryCount: number; maxRetries: number },
    events: {} as
      | { type: "DRAW_INITIATED"; providerRef: string }
      | { type: "FUNDS_SETTLED"; settledAt: number }
      // ... etc
  },
  actions: {
    recordProviderRef: () => { /* resolved by GT effect registry */ },
    emitPaymentReceived: () => { /* resolved by GT effect registry */ },
    // ...
  },
}).createMachine({
  id: "collectionAttempt",
  version: COLLECTION_ATTEMPT_MACHINE_VERSION,
  initial: "initiated",
  // ...
});
```

The transfer machine must have:

**Context:**
```typescript
context: {} as {
  transferId: string;
  providerRef: string;
  retryCount: number;
}
```

**Events:**
```typescript
events: {} as
  | { type: 'PROVIDER_INITIATED'; providerRef: string }
  | { type: 'PROVIDER_ACKNOWLEDGED'; providerRef: string }
  | { type: 'PROCESSING_UPDATE'; providerData: Record<string, unknown> }
  | { type: 'FUNDS_SETTLED'; settledAt: number; providerData: Record<string, unknown> }
  | { type: 'TRANSFER_FAILED'; errorCode: string; reason: string }
  | { type: 'TRANSFER_REVERSED'; reversalRef: string; reason: string }
  | { type: 'TRANSFER_CANCELLED'; reason: string }
```

**Actions (all no-op stubs — resolved by GT effect registry):**
- `recordTransferProviderRef`
- `publishTransferConfirmed`
- `publishTransferFailed`
- `publishTransferReversed`

**States and transitions:**
```
initiated:
  PROVIDER_INITIATED → pending [recordTransferProviderRef]
  FUNDS_SETTLED → confirmed [publishTransferConfirmed]  (immediate shortcut for manual)
  TRANSFER_CANCELLED → cancelled

pending:
  PROVIDER_ACKNOWLEDGED → pending (self-loop, no action)
  PROCESSING_UPDATE → processing
  FUNDS_SETTLED → confirmed [publishTransferConfirmed]
  TRANSFER_FAILED → failed [publishTransferFailed]

processing:
  FUNDS_SETTLED → confirmed [publishTransferConfirmed]
  TRANSFER_FAILED → failed [publishTransferFailed]

confirmed:
  TRANSFER_REVERSED → reversed [publishTransferReversed]

failed: { type: 'final' }
cancelled: { type: 'final' }
reversed: { type: 'final' }
```

**Key design points:**
- `initiated → confirmed` shortcut is for ManualPaymentMethod (immediate confirmation)
- No retry logic in this machine — retry is owned by Collection Plan (Layer 2)
- Export `TRANSFER_MACHINE_VERSION = '1.0.0'`
- Pure data only — no Convex imports, no I/O, no database references

---

## T-005: Add `"transfer"` to EntityType and GovernedEntityType

**File:** `convex/engine/types.ts`

**Current EntityType (lines 3-17):**
```typescript
export type EntityType =
  | "onboardingRequest"
  | "mortgage"
  | "obligation"
  | "collectionAttempt"
  | "deal"
  | "provisionalApplication"
  | "applicationPackage"
  | "broker"
  | "borrower"
  | "lender"
  | "lenderOnboarding"
  | "provisionalOffer"
  | "offerCondition"
  | "lenderRenewalIntent";
```

Add `| "transfer"` after `"deal"`.

**Current GovernedEntityType (lines 22-27):**
```typescript
export type GovernedEntityType =
  | "onboardingRequest"
  | "mortgage"
  | "obligation"
  | "collectionAttempt"
  | "deal";
```

Add `| "transfer"` after `"deal"`.

---

## T-006: Add to ENTITY_TABLE_MAP

**File:** `convex/engine/types.ts`

**Current map (lines 165-180):**
```typescript
export const ENTITY_TABLE_MAP = {
  onboardingRequest: "onboardingRequests",
  mortgage: "mortgages",
  obligation: "obligations",
  collectionAttempt: "collectionAttempts",
  deal: "deals",
  // ... non-governed entities ...
} as const satisfies Record<EntityType, string>;
```

Add `transfer: "transferRequests",` after the `deal` entry.

---

## T-007: Add to entityTypeValidator

**File:** `convex/engine/validators.ts`

**Current validator (lines 21-36):**
```typescript
export const entityTypeValidator = v.union(
  v.literal("onboardingRequest"),
  v.literal("mortgage"),
  v.literal("obligation"),
  v.literal("collectionAttempt"),
  v.literal("deal"),
  v.literal("provisionalApplication"),
  v.literal("applicationPackage"),
  v.literal("broker"),
  v.literal("borrower"),
  v.literal("lender"),
  v.literal("lenderOnboarding"),
  v.literal("provisionalOffer"),
  v.literal("offerCondition"),
  v.literal("lenderRenewalIntent")
);
```

Add `v.literal("transfer"),` after `v.literal("deal"),`.

---

## T-008: Register transferMachine

**File:** `convex/engine/machines/registry.ts`

**Current (complete):**
```typescript
import type { AnyStateMachine } from "xstate";
import type { GovernedEntityType } from "../types";
import { collectionAttemptMachine } from "./collectionAttempt.machine";
import { dealMachine } from "./deal.machine";
import { mortgageMachine } from "./mortgage.machine";
import { obligationMachine } from "./obligation.machine";
import { onboardingRequestMachine } from "./onboardingRequest.machine";

export const machineRegistry: Record<GovernedEntityType, AnyStateMachine> = {
  collectionAttempt: collectionAttemptMachine,
  deal: dealMachine,
  mortgage: mortgageMachine,
  obligation: obligationMachine,
  onboardingRequest: onboardingRequestMachine,
} as const;
```

Add import for `transferMachine` and add `transfer: transferMachine,` to the registry.

**Note:** After adding `"transfer"` to `GovernedEntityType` in T-005, TypeScript will REQUIRE this entry — the `Record<GovernedEntityType, AnyStateMachine>` type enforces completeness.
