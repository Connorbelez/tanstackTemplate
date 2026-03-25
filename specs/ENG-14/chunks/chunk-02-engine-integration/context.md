# Chunk 2 Context: Engine Integration & Quality Gate

## Goal
Wire the updated effect registry into the transition engine by adding `console.warn` for missing effects, passing the full `EffectPayload` to scheduled effects, updating tests, and ensuring all quality checks pass.

## Prerequisites (completed by Chunk 1)
- `EffectPayload` interface exists in `convex/engine/types.ts`
- `effectPayloadValidator` exists in `convex/engine/validators.ts`
- `effectRegistry` updated with all entries and widened type
- Onboarding machine actions renamed (notifyApplicantApproved, notifyApplicantRejected, assignRole)
- `assignRole` effect exists (renamed from assignRoleToUser)
- Notification stubs exist in onboarding.ts
- Obligation stubs exist in obligation.ts

---

## T-008: Add console.warn for Missing Effects

File: `convex/engine/transition.ts`

The current `scheduleEffects` function silently skips missing effects. Add a `console.warn`:

**Current code (in `scheduleEffects`):**
```typescript
const handler = effectRegistry[actionDescriptor.actionType];
if (handler) {
  await ctx.scheduler.runAfter(0, handler, {
    entityId,
    journalEntryId,
    effectName: actionDescriptor.actionType,
    params: actionDescriptor.params,
  });
  effectNames.push(actionDescriptor.actionType);
}
```

**Updated code:**
```typescript
const handler = effectRegistry[actionDescriptor.actionType];
if (handler) {
  await ctx.scheduler.runAfter(0, handler, {
    entityId,
    journalEntryId,
    effectName: actionDescriptor.actionType,
    // ... (full EffectPayload — see T-009)
  });
  effectNames.push(actionDescriptor.actionType);
} else {
  console.warn(
    `[GT Effect Scheduler] No handler registered for effect "${actionDescriptor.actionType}". Skipping.`
  );
}
```

This is an acceptance criterion: "Missing effect in registry → `console.warn` + continue (never crash the engine)".

## T-009: Pass Full EffectPayload to Scheduled Effects

File: `convex/engine/transition.ts`

The `scheduleEffects` function currently only passes `entityId`, `journalEntryId`, `effectName`, and `params`. It needs to pass the full `EffectPayload` shape:

```typescript
{
  entityId,
  entityType,
  eventType,
  journalEntryId,
  effectName: actionDescriptor.actionType,
  payload: actionDescriptor.params,
  source: resolvedSource,
}
```

This means the `scheduleEffects` function signature needs additional parameters: `entityType`, `eventType`, and `source`.

**Updated function signature:**
```typescript
async function scheduleEffects(
  ctx: MutationCtx,
  entityId: string,
  entityType: EntityType,
  eventType: string,
  journalEntryId: string,
  source: CommandSource,
  scheduledEffects: ScheduledEffectDescriptor[]
): Promise<string[]>
```

**Update all call sites** of `scheduleEffects` within `transitionEntity` to pass the new params. There are 2 call sites:
1. The "same state but has effects" path (around line 223)
2. The "state changed" path (around line 301)

Both already have access to `entityType`, `eventType`, and `resolvedSource` in the enclosing scope.

Import `EffectPayload` type from `./types` if useful for documentation, but the actual payload is constructed inline as an object literal.

Also rename `params` → `payload` in the scheduler call to match the EffectPayload interface.

## T-010: Update Onboarding Machine Test

File: `convex/engine/machines/__tests__/onboardingRequest.machine.test.ts`

This test likely references the old action name `assignRoleToUser`. Update all references to the new names:
- `assignRoleToUser` → `notifyApplicantApproved` (on APPROVE transition)
- New: `notifyApplicantRejected` (on REJECT transition)
- New: `assignRole` (on ASSIGN_ROLE transition)

If the test checks that specific actions are produced by transitions, update those assertions. The machine behavior (states, transitions) is unchanged — only the action names are different.

## T-011: Quality Gate

Run these commands in order:
```bash
bun check          # Auto-formats + lints (run FIRST per CLAUDE.md)
bun typecheck      # TypeScript type checking
bunx convex codegen  # Regenerate Convex types (needed after adding new functions)
```

Fix any errors. Common issues to watch for:
- `internal.engine.effects.onboarding.assignRoleToUser` references may still exist in generated code — run `bunx convex codegen` to regenerate
- The widened registry type `FunctionReference<"mutation" | "action", "internal">` may cause type errors if Convex's type system doesn't support the union — if so, use a type assertion or `FunctionReference<"mutation", "internal"> | FunctionReference<"action", "internal">`
- Any file that imports `assignRoleToUser` by name needs updating

After fixing, re-run all three commands to confirm clean output.

---

## Key Constraint
**From Spec Rule 5:** Effects are fire-and-forget. The transition is committed before effects run. The `scheduleEffects` function runs within the mutation but schedules effects via `ctx.scheduler.runAfter(0, ...)` which runs them asynchronously after the mutation commits.

## Files to Read Before Starting
- `convex/engine/transition.ts` — main file to modify
- `convex/engine/machines/__tests__/onboardingRequest.machine.test.ts` — test to update
- `convex/engine/types.ts` — to import EffectPayload/EntityType/CommandSource if needed
