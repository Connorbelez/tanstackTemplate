# Context: ENG-11 Machine Registry

## Linear Issue

Create the type-safe registry mapping `EntityType` → XState machine definition, plus a `getMachineVersion()` helper for audit trail versioning.

**Files:** `convex/machines/registry.ts` (note: actual path is `convex/engine/machines/registry.ts`)

### Acceptance Criteria
- `machineRegistry: Record<GovernedEntityType, AnyStateMachine>` maps all three Phase 1 entity types to their machines
- `getMachineVersion(entityType)` returns `"{machineId}@{version}"` string for audit journal
- Adding a new machine is a one-line addition to the registry
- TypeScript enforces completeness — missing a machine for a GovernedEntityType is a compile error
- `bun check` and `bun typecheck` pass

### Technical Notes
- ENG-17 (obligation machine) is NOT merged yet. Create a minimal stub.
- ENG-15 (onboardingRequest) and ENG-16 (mortgage) ARE merged and their machines exist.

## Spec: §3.4 Machine Registry (from SPEC 1.2)

The spec defines the registry as:

```typescript
export const machineRegistry: Record<EntityType, AnyStateMachine> = {
  onboardingRequest: onboardingRequestMachine,
  mortgage: mortgageMachine,
  obligation: obligationMachine,
};

// Helper: get machine version (hash of definition for audit trail)
export function getMachineVersion(entityType: EntityType): string {
  const machine = machineRegistry[entityType];
  return `${machine.id}@${machine.version ?? "1.0.0"}`;
}
```

## Architecture Context (from Governed Transitions doc)

The Machine Registry is Component 1 of 5 in the Governed Transitions architecture:
- The transition engine looks up machines via `machineRegistry[entityType]`
- The audit journal records `machineVersion` from `getMachineVersion()`
- Machines are pure XState v5 definitions — no Convex imports, no I/O, no async

## Current Codebase State

### `convex/engine/types.ts` — EntityType (CURRENT)
```typescript
export type EntityType =
  | "onboardingRequest"
  | "mortgage"
  | "obligation"
  | "deal"
  | "provisionalApplication"
  | "applicationPackage"
  | "broker"
  | "borrower"
  | "lenderOnboarding"
  | "provisionalOffer"
  | "offerCondition"
  | "lenderRenewalIntent";
```

Note: EntityType has many more types than have machines. We need a `GovernedEntityType` subset for the Phase 1 machine types only. This subset must be a proper subtype of `EntityType`.

### `convex/engine/machines/registry.ts` — CURRENT (to be replaced)
```typescript
import type { AnyStateMachine } from "xstate";
import type { EntityType } from "../types";
import { mortgageMachine } from "./mortgage.machine";
import { onboardingRequestMachine } from "./onboardingRequest.machine";

export const machineRegistry: Partial<Record<EntityType, AnyStateMachine>> = {
  mortgage: mortgageMachine,
  onboardingRequest: onboardingRequestMachine,
} as const;
```

Problems:
1. Uses `Partial` — no compile-time completeness check
2. Missing obligation machine
3. No `getMachineVersion()` helper
4. `as const` is unnecessary with explicit type annotation

### `convex/engine/machines/onboardingRequest.machine.ts` — EXISTS
- Machine id: `"onboardingRequest"`
- States: pending_review → approved → role_assigned | rejected
- No machineContext

### `convex/engine/machines/mortgage.machine.ts` — EXISTS
- Machine id: `"mortgage"`
- States: active → delinquent → defaulted → collections → written_off | matured
- Has MortgageMachineContext with missedPayments, lastPaymentAt

### Obligation machine — DOES NOT EXIST (ENG-17 not merged)
From ENG-17 spec:
- Machine id should be: `"obligation"`
- States: upcoming → due → overdue → settled
- No machineContext needed for thin slice
- Effect marker actions: emitObligationOverdue (on GRACE_PERIOD_EXPIRED), emitObligationSettled (on PAYMENT_APPLIED)
- Terminal: settled is final

Create a **stub** that matches this spec so the registry compiles. The real machine will replace it when ENG-17 merges.

### `convex/engine/transition.ts` — USES the registry
- Line 7: `import { machineRegistry } from "./machines/registry";`
- Line 50: `extractScheduledEffects` uses `NonNullable<(typeof machineRegistry)[keyof typeof machineRegistry]>` — this will simplify when registry is no longer Partial
- Line 145: `const machine = machineRegistry[entityType];` then null-checks — the null check won't be needed for GovernedEntityType
- Line 198: Uses `machine.id` directly for machineVersion — should use `getMachineVersion()` instead

## Developer Checklist (from spec)
Adding a new governed entity:
1. Define the machine — `convex/engine/machines/{entityType}.machine.ts`
2. Add the entity type — Update `GovernedEntityType` union in `engine/types.ts`
3. Register the machine — Add to `machineRegistry` in `machines/registry.ts` (one line)
4. (remaining steps are for other issues)

## Design Decisions

1. **`GovernedEntityType` vs narrowing `EntityType`**: Introduce a new type `GovernedEntityType` as a subset. Keep `EntityType` broad (it's used elsewhere for table mappings etc). The registry maps `GovernedEntityType → AnyStateMachine`.

2. **Obligation stub**: Create a minimal working XState machine matching the ENG-17 spec. Include a `// TODO(ENG-17): Replace with real machine when merged` comment.

3. **`getMachineVersion()` format**: `"{machineId}@{version}"` where version comes from `machine.version ?? "1.0.0"`. The transition engine already uses `machine.id` in audit entries — update those to use `getMachineVersion()`.

4. **Export pattern**: Export both `machineRegistry` and `getMachineVersion()` from registry.ts. The registry const + helper function is the full public API.
