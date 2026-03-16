# Chunk Context: Engine Core

Source: Linear ENG-12, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

### Step 1: Add status serialization helpers
**File:** `convex/engine/serialization.ts` (Create)
```typescript
/**
 * Serialize XState state value for storage.
 * Simple string states stored as-is.
 * Parallel/compound states stored as JSON.
 */
export function serializeStatus(stateValue: string | Record<string, unknown>): string {
  if (typeof stateValue === "string") return stateValue;
  return JSON.stringify(stateValue);
}

/**
 * Deserialize stored status back to XState state value.
 * JSON string → parsed object (parallel states).
 * Plain string → returned as-is (simple states).
 */
export function deserializeStatus(status: string): string | Record<string, unknown> {
  if (status.startsWith("{")) {
    try { return JSON.parse(status); }
    catch { return status; }
  }
  return status;
}
```

### Step 3: Rewrite the core transition engine
**File:** `convex/engine/transition.ts` (Rewrite)
The function implements the 8-step pipeline. The plan's code sketch:
```typescript
import { ConvexError } from "convex/values";
import { getNextSnapshot } from "xstate";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { auditLog } from "../auditLog";
import { effectRegistry } from "./effects/registry";
import { entityTableMap } from "./entityMap";
import { machineRegistry } from "./machines/registry";
import { deserializeStatus, serializeStatus } from "./serialization";
import type { CommandSource, EntityType, TransitionResult } from "./types";

export async function executeTransition(
  ctx: MutationCtx,
  command: {
    entityType: EntityType;
    entityId: string;
    eventType: string;
    payload?: Record<string, unknown>;
    source: CommandSource;
  }
): Promise<TransitionResult> {
  // ... 8 step pipeline
}
```

### Step 6: Update transitionMutation.ts
**File:** `convex/engine/transitionMutation.ts` (Modify)
Update to use `executeTransition` instead of the old `transitionEntity`:
```typescript
import { internalMutation } from "../_generated/server";
import { executeTransition } from "./transition";
import type { EntityType } from "./types";
import { commandArgsValidator } from "./validators";

export const transitionMutation = internalMutation({
  args: commandArgsValidator,
  handler: async (ctx, args) => {
    return executeTransition(ctx, {
      entityType: args.entityType as EntityType,
      entityId: args.entityId,
      eventType: args.eventType,
      payload: (args.payload as Record<string, unknown>) ?? {},
      source: args.source ?? { channel: "scheduler", actorType: "system" },
    });
  },
});
```

## Architecture Context (from Governed Transitions Architecture Doc)

### The Transition Engine contract:
The Transition Engine is a generic Convex mutation that processes any command against any machine. It is the only code path that modifies entity status. There are no ad-hoc status updates anywhere in the codebase.

The 8-step pipeline from the architecture:
```
1. LOAD — Read entity record (status + machineContext)
2. RESOLVE — Look up machine from registry
3. HYDRATE — machine.resolveState({ value: deserializeStatus(status), context })
4. COMPUTE — getNextSnapshot(machine, hydratedState, { type: eventType, ...payload }) — pure
5. DETECT — Compare new vs previous state. Unchanged → rejection path
6. PERSIST — Atomic: ctx.db.patch(entity, ...) + appendAuditJournalEntry(ctx, ...)
7. EFFECTS — Schedule each declared action via ctx.scheduler.runAfter(0, ...)
8. AUDIT — Layer 2 hash-chain entry (via startHashChain workflow)
```

Status serialization from SPEC 1.2:
```typescript
// Step 5 from SPEC:
const newStatus = typeof nextSnapshot.value === "string"
  ? nextSnapshot.value
  : JSON.stringify(nextSnapshot.value); // parallel/nested states
const transitioned = newStatus !== previousState;
```

### CommandSource interface:
```typescript
export interface CommandSource {
  channel:
    | "borrower_portal"
    | "broker_portal"
    | "onboarding_portal"
    | "admin_dashboard"
    | "api_webhook"
    | "scheduler";
  actorId?: string;
  actorType?: "borrower" | "broker" | "member" | "admin" | "system";
  ip?: string;
  sessionId?: string;
}
```
The source is metadata, not control flow. The machine receives the same event type regardless of source.

## Existing Code State (CRITICAL — read before rewriting)

### `convex/engine/types.ts` — ALREADY HAS:
- `EntityType` union (12 entity types including all governed + future ones)
- `GovernedEntityType` = `"onboardingRequest" | "mortgage" | "obligation"` (subset with machines)
- `CommandSource`, `Command<TPayload>`, `TransitionResult`, `EffectPayload`, `AuditJournalEntry`
- `ENTITY_TABLE_MAP: Record<EntityType, string>` — maps ALL entity types to table names
- `effectsScheduled?: string[]` already on `AuditJournalEntry`

### `convex/engine/machines/registry.ts` — ALREADY HAS:
```typescript
export const machineRegistry: Record<GovernedEntityType, AnyStateMachine> = {
  mortgage: mortgageMachine,
  obligation: obligationMachine,
  onboardingRequest: onboardingRequestMachine,
} as const;

export function getMachineVersion(entityType: GovernedEntityType): string {
  const machine = machineRegistry[entityType];
  return `${machine.id}@${machine.version ?? "1.0.0"}`;
}
```

### `convex/engine/auditJournal.ts` — ALREADY HAS:
```typescript
export async function appendAuditJournalEntry(
  ctx: MutationCtx,
  entry: AuditJournalEntry
): Promise<Id<"auditJournal">> {
  const journalEntryId = await ctx.db.insert("auditJournal", entry);
  await startHashChain(ctx, journalEntryId);
  return journalEntryId;
}
```
This handles both Layer 1 (atomic `ctx.db.insert`) and Layer 2 (hash chain workflow).

### `convex/engine/effects/registry.ts` — ALREADY HAS:
```typescript
export const effectRegistry: Record<string, FunctionReference<"mutation" | "action", "internal">> = {
  assignRole: internal.engine.effects.onboarding.assignRole,
  notifyApplicantApproved: internal.engine.effects.onboarding.notifyApplicantApproved,
  notifyApplicantRejected: internal.engine.effects.onboarding.notifyApplicantRejected,
  notifyAdminNewRequest: internal.engine.effects.onboarding.notifyAdminNewRequest,
  emitObligationOverdue: internal.engine.effects.obligation.emitObligationOverdue,
  emitObligationSettled: internal.engine.effects.obligation.emitObligationSettled,
};
```

### Current `convex/engine/transition.ts` — WHAT NEEDS TO CHANGE:
1. **Hardcoded table**: Lines 141-146 — `if (entityType !== "onboardingRequest") throw Error(...)` and `ctx.db.get(entityId as Id<"onboardingRequests">)` → Use `ENTITY_TABLE_MAP[entityType]` for generic loading
2. **Plain Error**: Uses `throw new Error(...)` → Use `throw new ConvexError({ code: "...", message: "..." })`
3. **No serialization**: `entity.status as string` and `nextSnapshot.value as string` → Use `deserializeStatus()` / `serializeStatus()`
4. **Hardcoded patch**: Line 295 `ctx.db.patch(entityId as Id<"onboardingRequests">, ...)` → Use `Id<typeof tableName>`
5. **Hardcoded resourceType**: Line 177 `const resourceType = "onboardingRequests"` → Use `ENTITY_TABLE_MAP[entityType]`
6. **Function name**: `transitionEntity` → `executeTransition`
7. **Function signature**: Positional params → single command object arg

### What to KEEP from current transition.ts:
- `extractScheduledEffects()` — config inspection approach (practical for pure `getNextSnapshot`)
- `normalizeActionDescriptors()` — action descriptor normalization
- `scheduleEffects()` — effect scheduling with `xstate.` prefix filtering + `console.warn` for missing
- Same-state-with-effects path (lines 190-291) — handles targetless transitions with effects
- `appendAuditJournalEntry()` usage for Layer 1 audit (already correct)
- `auditLog.log()` for broader audit component (keep dual-write)
- `isGovernedEntityType()` type guard — but update to use `GovernedEntityType` properly

## Types & Interfaces

The function signature for `executeTransition`:
```typescript
export async function executeTransition(
  ctx: MutationCtx,
  command: {
    entityType: EntityType;
    entityId: string;
    eventType: string;
    payload?: Record<string, unknown>;
    source: CommandSource;
  }
): Promise<TransitionResult>
```

Note: The command accepts `EntityType` (broader union) but the machine registry only has `GovernedEntityType`. The function must validate that the given `entityType` is a `GovernedEntityType` with a registered machine, throwing `ConvexError` if not.

For generic entity loading, use:
```typescript
const tableName = ENTITY_TABLE_MAP[entityType];
const entity = await ctx.db.get(entityId as Id<typeof tableName>);
```

## Constraints & Rules
- `bun check`, `bun typecheck`, and `bunx convex codegen` must pass
- NEVER use `any` as a type unless absolutely necessary
- Run `bun check` first before manually fixing lint/format errors
- Convex mutations cannot call other mutations — `executeTransition()` must remain a helper function called within mutation context
- The transition engine is the **only** code path that changes a governed entity's status field
- Long-term maintainability: extract shared logic into modules, avoid duplication

## File Structure
- `convex/engine/serialization.ts` — CREATE
- `convex/engine/transition.ts` — REWRITE
- `convex/engine/transitionMutation.ts` — MODIFY (minor update to new function name)
