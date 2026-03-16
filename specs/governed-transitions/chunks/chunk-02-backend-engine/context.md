# Chunk 02 Context — Backend Engine & Mutations

## Overview

Create the machine registry, transition engine mutation, and write mutations for the Governed Transitions demo. This is the core backend logic.

**Design philosophy:** The database is the source of truth. The machine is the law. The journal is the receipt.

## The Seven Rules

1. **The machine is the law.** If a transition isn't in the machine definition, it cannot happen.
2. **Status changes go through the engine.** No direct `ctx.db.patch(id, { status: "..." })` outside the Transition Engine.
3. **Commands are source-agnostic.** The machine never branches on `source.channel` or `source.actorType`.
4. **Guards are pure functions.** No I/O, no database reads, no async.
5. **Effects are fire-and-forget.** The transition is committed before effects run.
6. **The journal records everything.** Successful transitions and rejected commands.
7. **Machine definitions are pure data.** No imports from Convex.

## Types & Interfaces

```typescript
interface CommandSource {
  channel: "borrower_portal" | "broker_portal" | "admin_dashboard" | "api_webhook" | "scheduler";
  actorId?: string;
  actorType?: "borrower" | "broker" | "admin" | "system";
  sessionId?: string;
}

interface TransitionResult {
  success: boolean;
  previousState: string;
  newState: string;
  reason?: string;
  effectsScheduled?: string[];
}
```

## Machine Registry

File: `convex/demo/machines/registry.ts`

```typescript
import { loanApplicationMachine } from "./loanApplication.machine";

export const machineRegistry = {
  loanApplication: loanApplicationMachine,
} as const;

export type EntityType = keyof typeof machineRegistry;
```

## Transition Engine — Exact Algorithm

File: `convex/demo/governedTransitions.ts`

```typescript
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { machineRegistry, type EntityType } from "./machines/registry";

export const transition = mutation({
  args: {
    entityId: v.id("demo_gt_entities"),
    eventType: v.string(),
    payload: v.optional(v.any()),
    source: v.object({
      channel: v.string(),
      actorId: v.optional(v.string()),
      actorType: v.optional(v.string()),
      sessionId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const { entityId, eventType, payload, source } = args;

    // 1. Load entity
    const entity = await ctx.db.get(entityId);
    if (!entity) throw new Error(`Entity ${entityId} not found`);

    const previousState = entity.status;
    const entityType = entity.entityType as EntityType;

    // 2. Get machine definition from registry
    const machineDef = machineRegistry[entityType];
    if (!machineDef) throw new Error(`No machine for entity type: ${entityType}`);

    // 3. Hydrate machine to current state
    const restoredState = machineDef.resolveState({
      value: previousState,
      context: {
        entityId: entityId as string,
        data: entity.data,
        ...(entity.machineContext ?? {}),
      },
    });

    // 4. Compute transition (PURE — no side effects)
    const event = { type: eventType, ...payload };
    const nextState = machineDef.transition(restoredState, event);

    // 5. Check if transition actually occurred
    const newStatus = typeof nextState.value === "string"
      ? nextState.value
      : JSON.stringify(nextState.value);
    const transitioned = newStatus !== previousState;

    if (!transitioned) {
      // 5a. Command rejected — log to journal and return
      await ctx.db.insert("demo_gt_journal", {
        entityType,
        entityId,
        eventType,
        payload,
        previousState,
        newState: previousState,
        outcome: "rejected",
        reason: `No valid transition for ${eventType} from ${previousState}`,
        source,
        machineVersion: machineDef.config.id ?? "unknown",
        timestamp: Date.now(),
      });

      return {
        success: false,
        previousState,
        newState: previousState,
        reason: `No valid transition for ${eventType} from ${previousState}`,
      };
    }

    // 6. Persist new state (ATOMIC with journal write below)
    await ctx.db.patch(entityId, {
      status: newStatus,
      machineContext: nextState.context,
      lastTransitionAt: Date.now(),
    });

    // 7. Collect declared effects (action names from the machine)
    const effectNames = (nextState.actions ?? [])
      .map((a: { type: string }) => a.type)
      .filter((name: string) => name !== "xstate.stop" && !name.startsWith("xstate."));

    // 8. Write journal entry (ATOMIC with entity patch)
    const journalId = await ctx.db.insert("demo_gt_journal", {
      entityType,
      entityId,
      eventType,
      payload,
      previousState,
      newState: newStatus,
      outcome: "transitioned",
      source,
      machineVersion: machineDef.config.id ?? "unknown",
      timestamp: Date.now(),
      effectsScheduled: effectNames.length > 0 ? effectNames : undefined,
    });

    // 9. Schedule declared effects (fire-and-forget)
    for (const effectName of effectNames) {
      await ctx.scheduler.runAfter(0, internal.demo.governedTransitions.executeEffect, {
        entityId,
        journalEntryId: journalId,
        effectName,
      });
    }

    // 10. Schedule hash-chain copy to auditTrail component
    await ctx.scheduler.runAfter(0, internal.demo.governedTransitions.hashChainJournalEntry, {
      journalEntryId: journalId,
    });

    return {
      success: true,
      previousState,
      newState: newStatus,
      effectsScheduled: effectNames.length > 0 ? effectNames : undefined,
    };
  },
});
```

**Critical invariant (Rule 2):** No other code may call `ctx.db.patch(id, { status })` on `demo_gt_entities`. The `runFullLifecycle` mutation is the one exception — it reuses the same transition logic inline (not by calling the exported mutation, since Convex mutations can't call other mutations directly).

## createEntity Mutation

```typescript
export const createEntity = mutation({
  args: {
    label: v.string(),
    loanAmount: v.number(),
    applicantName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("demo_gt_entities", {
      entityType: "loanApplication",
      label: args.label,
      status: "draft",
      data: {
        loanAmount: args.loanAmount,
        applicantName: args.applicantName,
      },
      createdAt: Date.now(),
    });
  },
});
```

## seedEntities Mutation

Idempotent — check if entities already exist first. Pattern reference from `convex/demo/auditTraceability.ts`:
```typescript
// Check existing entities first
const existing = await ctx.db.query("demo_gt_entities").collect();
if (existing.length > 0) return;
```

Create 3 sample entities:
1. "First-Time Buyer Application" — loanAmount: 350000, applicantName: "Sarah Chen"
2. "Investment Property Refinance" — loanAmount: 520000, applicantName: "Marcus Johnson"
3. "Pre-Approval Request" — loanAmount: 280000, applicantName: "Emily Rodriguez"

All start in "draft" status with entityType "loanApplication".

## runFullLifecycle Mutation

Executes as a single mutation. All transitions are sequential within the mutation — no `ctx.scheduler.runAfter` between steps. The transition logic is duplicated inline because Convex mutations can't call other exported mutations directly.

Steps:
1. Create entity "Lifecycle Demo — {timestamp}" with loanAmount 500000, applicantName "Demo User"
2. Execute 5 transitions inline (using same hydrate/validate/persist/journal pattern):
   - `SUBMIT` from `borrower_portal` (actor: "borrower-demo", actorType: "borrower")
   - `ASSIGN_REVIEWER` from `admin_dashboard` (actor: "admin-demo", actorType: "admin")
   - `APPROVE` from `admin_dashboard` (actor: "admin-demo", actorType: "admin")
   - `FUND` from `api_webhook` (actor: "system", actorType: "system")
   - `CLOSE` from `scheduler` (actor: "system", actorType: "system")
3. Each step writes its own journal entry
4. Returns `{ entityId, journalEntries: 5 }`

**Important:** Since this duplicates the transition engine logic, extract a shared helper function within the file that both `transition` and `runFullLifecycle` can use. This avoids code duplication.

## Database Tables (for reference)

The `demo_gt_entities`, `demo_gt_journal`, and `demo_gt_effects_log` tables were created in chunk-01. See the schema validators there. Key points:
- `demo_gt_entities.status` is a `v.string()` holding the XState state value
- `demo_gt_journal.outcome` is `v.union(v.literal("transitioned"), v.literal("rejected"))`
- `demo_gt_journal.source` is a `v.object({ channel: v.string(), actorId: v.optional(v.string()), ... })`

## Convex Conventions

- Use `mutation` from `./_generated/server` (NOT the fluent builder)
- Use `v` from `"convex/values"` for argument validators
- Use `internal` from `./_generated/api` for scheduling internal functions
- The `executeEffect` and `hashChainJournalEntry` internal functions will be created in chunk-03. For now, include their references in the transition engine (they'll be `internalMutation` exports in the same file). If TypeScript complains about missing exports, stub them as empty `internalMutation`s.

## File Structure

```
convex/demo/
  governedTransitions.ts              — All queries, mutations, internal functions
  machines/
    loanApplication.machine.ts        — Already created in chunk-01
    registry.ts                       — Machine type → definition map
```
