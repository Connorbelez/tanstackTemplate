# Chunk 1 Context: Types, Effects & Registry

## Goal
Define the `EffectPayload` interface and validators, rename onboarding machine actions to match spec, create all effect stubs, and populate the effect registry.

## Resolved Design Decisions
1. **Rename `assignRoleToUser` → `assignRole`** and add `notifyApplicantApproved`/`notifyApplicantRejected`/`notifyAdminNewRequest` as separate stubs.
2. **`emitObligationOverdue`** — obligation domain only, no mortgage registry entry.
3. **`EffectPayload`** lives in `convex/engine/types.ts` with all other GT types.

---

## T-001: EffectPayload Interface

Add this interface to `convex/engine/types.ts` after the `TransitionResult` interface:

```typescript
export interface EffectPayload {
  entityId: string;
  entityType: EntityType;
  eventType: string;
  journalEntryId: string;
  effectName: string;
  payload?: Record<string, unknown>;
  source: CommandSource;
}
```

This uses the existing `EntityType` and `CommandSource` types already defined in that file.

## T-002: effectPayloadValidator

Add to `convex/engine/validators.ts`:

```typescript
export const effectPayloadValidator = {
  entityId: v.string(),
  entityType: entityTypeValidator,
  eventType: v.string(),
  journalEntryId: v.string(),
  effectName: v.string(),
  payload: v.optional(v.any()),
  source: sourceValidator,
};
```

Both `entityTypeValidator` and `sourceValidator` already exist in this file.

## T-003: Update Onboarding Machine Action Names

File: `convex/engine/machines/onboardingRequest.machine.ts`

The current machine declares `assignRoleToUser` on APPROVE. The spec declares different actions:

**Current machine (WRONG):**
```typescript
states: {
  pending_review: {
    on: {
      APPROVE: {
        target: "approved",
        actions: ["assignRoleToUser"],
      },
      REJECT: { target: "rejected" },
    },
  },
  approved: {
    on: { ASSIGN_ROLE: { target: "role_assigned" } },
  },
  // ...
}
```

**Spec machine (TARGET):**
```typescript
states: {
  pending_review: {
    on: {
      APPROVE: {
        target: "approved",
        actions: ["notifyApplicantApproved"],
      },
      REJECT: {
        target: "rejected",
        actions: ["notifyApplicantRejected"],
      },
    },
  },
  approved: {
    on: {
      ASSIGN_ROLE: {
        target: "role_assigned",
        actions: ["assignRole"],
      },
    },
  },
  rejected: { type: "final" },
  role_assigned: { type: "final" },
}
```

Key changes:
- APPROVE action: `assignRoleToUser` → `notifyApplicantApproved`
- REJECT: add `actions: ["notifyApplicantRejected"]`
- ASSIGN_ROLE: add `actions: ["assignRole"]`

Also update the `actions` map in the `setup()` call to declare all three:
```typescript
actions: {
  notifyApplicantApproved: () => { /* resolved by GT effect registry */ },
  notifyApplicantRejected: () => { /* resolved by GT effect registry */ },
  assignRole: () => { /* resolved by GT effect registry */ },
},
```

## T-004: Rename assignRoleToUser → assignRole

File: `convex/engine/effects/onboarding.ts`

The existing `assignRoleToUser` export must be renamed to `assignRole`. This is a substantial internalAction with real WorkOS provisioning logic — preserve all handler logic, only change:

1. Export name: `assignRoleToUser` → `assignRole`
2. Args: replace current ad-hoc args with `effectPayloadValidator`
   - Current: `{ entityId: v.string(), journalEntryId: v.string(), effectName: v.string(), params: v.optional(v.object({})) }`
   - New: uses `effectPayloadValidator` (which has entityId, entityType, eventType, journalEntryId, effectName, payload, source)
3. Internal references to `args.entityId` and `args.journalEntryId` stay the same since those fields are in both schemas.
4. `args.params` references should become `args.payload` (but the current handler doesn't actually use params, so this is a no-op for the handler logic).

**CRITICAL:** The handler logic (WorkOS provisioning, audit logging, transition calling) must be completely preserved. Only the function name and args schema change.

Also update all console.log/error messages that reference `[assignRoleToUser]` to `[assignRole]`.

## T-005: Add Notification Stub Effects

Add to `convex/engine/effects/onboarding.ts` (same file as assignRole):

```typescript
export const notifyApplicantApproved = internalAction({
  args: effectPayloadValidator,
  handler: async (_ctx, args) => {
    console.info(
      `[stub] notifyApplicantApproved: entity=${args.entityId}, event=${args.eventType}`
    );
  },
});

export const notifyApplicantRejected = internalAction({
  args: effectPayloadValidator,
  handler: async (_ctx, args) => {
    console.info(
      `[stub] notifyApplicantRejected: entity=${args.entityId}, event=${args.eventType}`
    );
  },
});

export const notifyAdminNewRequest = internalAction({
  args: effectPayloadValidator,
  handler: async (_ctx, args) => {
    console.info(
      `[stub] notifyAdminNewRequest: entity=${args.entityId}, event=${args.eventType}`
    );
  },
});
```

Import `effectPayloadValidator` from `../validators`.

## T-006: Create Obligation Stub Effects

Create new file: `convex/engine/effects/obligation.ts`

```typescript
import { internalMutation } from "../../_generated/server";
import { effectPayloadValidator } from "../validators";

/**
 * Fires OBLIGATION_OVERDUE event at the parent mortgage.
 * Stub: logs intent. ENG-19 replaces with real cross-entity dispatch.
 */
export const emitObligationOverdue = internalMutation({
  args: effectPayloadValidator,
  handler: async (_ctx, args) => {
    console.info(
      `[stub] emitObligationOverdue: entity=${args.entityId}, event=${args.eventType}`
    );
  },
});

/**
 * Fires PAYMENT_CONFIRMED event at the parent mortgage.
 * Stub: logs intent. ENG-19 replaces with real cross-entity dispatch.
 */
export const emitObligationSettled = internalMutation({
  args: effectPayloadValidator,
  handler: async (_ctx, args) => {
    console.info(
      `[stub] emitObligationSettled: entity=${args.entityId}, event=${args.eventType}`
    );
  },
});
```

Note: These are `internalMutation` (not `internalAction`) because cross-entity effects will need to read/write the database when dispatching commands to the transition engine.

## T-007: Update Effect Registry

File: `convex/engine/effects/registry.ts`

Replace the entire file content:

```typescript
import type { FunctionReference } from "convex/server";
import { internal } from "../../_generated/api";

/**
 * Maps action names declared in XState machines to Convex internal function references.
 * Phase 1: static registry. Runtime registration is a future concern.
 */
export const effectRegistry: Record<
  string,
  FunctionReference<"mutation" | "action", "internal">
> = {
  // Onboarding effects
  assignRole: internal.engine.effects.onboarding.assignRole,
  notifyApplicantApproved: internal.engine.effects.onboarding.notifyApplicantApproved,
  notifyApplicantRejected: internal.engine.effects.onboarding.notifyApplicantRejected,
  notifyAdminNewRequest: internal.engine.effects.onboarding.notifyAdminNewRequest,
  // Obligation effects
  emitObligationOverdue: internal.engine.effects.obligation.emitObligationOverdue,
  emitObligationSettled: internal.engine.effects.obligation.emitObligationSettled,
};
```

Key changes from current:
- Type widened from `FunctionReference<"action", "internal">` to `FunctionReference<"mutation" | "action", "internal">`
- `assignRoleToUser` renamed to `assignRole`
- Added 5 new entries (3 onboarding notifications + 2 obligation stubs)

---

## Files to Read Before Starting
- `convex/engine/types.ts` — where EffectPayload goes
- `convex/engine/validators.ts` — where effectPayloadValidator goes
- `convex/engine/machines/onboardingRequest.machine.ts` — machine to update
- `convex/engine/effects/onboarding.ts` — effect to rename + stubs to add
- `convex/engine/effects/registry.ts` — registry to update

## Files to Create
- `convex/engine/effects/obligation.ts` — new stub effects

## Cross-References
- The `transitionMutation` at `convex/engine/transitionMutation.ts` calls `internal.engine.transitionMutation.transitionMutation` — the existing `assignRoleToUser` handler calls this. After rename to `assignRole`, ensure that import still resolves.
- The test at `convex/engine/machines/__tests__/onboardingRequest.machine.test.ts` may reference `assignRoleToUser` — update references if found.
