# Chunk 03 Context — Backend Queries, Effects & Tests

## Overview

Complete the backend by adding all query functions, internal functions (effects + hash chain), resetDemo, and machine unit tests.

The file `convex/demo/governedTransitions.ts` already exists from chunk-02 with the `transition`, `createEntity`, `seedEntities`, and `runFullLifecycle` mutations. Add the remaining exports to this same file.

## API Surface — Queries

### listEntities
```typescript
export const listEntities = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("demo_gt_entities")
      .order("desc")
      .collect();
  },
});
```

### getEntity
```typescript
export const getEntity = query({
  args: { id: v.id("demo_gt_entities") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});
```

### getJournal
Filter by optional entityId and outcome. Order by timestamp descending.
```typescript
export const getJournal = query({
  args: {
    entityId: v.optional(v.id("demo_gt_entities")),
    outcome: v.optional(v.string()),
  },
  handler: async (ctx, { entityId, outcome }) => {
    // If entityId provided, use the by_entity index
    // If outcome provided, use the by_outcome index
    // Otherwise, collect all and sort desc
    // Implementation: query appropriately, filter, return desc by timestamp
  },
});
```

### getJournalStats
```typescript
export const getJournalStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("demo_gt_journal").collect();
    return {
      total: all.length,
      transitioned: all.filter(e => e.outcome === "transitioned").length,
      rejected: all.filter(e => e.outcome === "rejected").length,
    };
  },
});
```

### getValidTransitions
Hydrate the machine to the entity's current state, then test every event type. For each event, call `machineDef.transition(state, { type: eventType })` — if the resulting state value differs from the current state, the event is valid.

```typescript
export const getValidTransitions = query({
  args: { entityId: v.id("demo_gt_entities") },
  handler: async (ctx, { entityId }) => {
    const entity = await ctx.db.get(entityId);
    if (!entity) return [];

    const entityType = entity.entityType as EntityType;
    const machineDef = machineRegistry[entityType];
    if (!machineDef) return [];

    const restoredState = machineDef.resolveState({
      value: entity.status,
      context: {
        entityId: entityId as string,
        data: entity.data,
        ...(entity.machineContext ?? {}),
      },
    });

    // Get all event types from the machine
    // Test each one against current state
    const allEvents = ["SUBMIT", "ASSIGN_REVIEWER", "APPROVE", "REJECT",
                       "REQUEST_INFO", "RESUBMIT", "REOPEN", "FUND", "CLOSE"];

    return allEvents.filter(eventType => {
      const next = machineDef.transition(restoredState, { type: eventType });
      const nextValue = typeof next.value === "string" ? next.value : JSON.stringify(next.value);
      return nextValue !== entity.status;
    });
  },
});
```

### getEffectsLog
```typescript
export const getEffectsLog = query({
  args: { entityId: v.optional(v.id("demo_gt_entities")) },
  handler: async (ctx, { entityId }) => {
    if (entityId) {
      return await ctx.db
        .query("demo_gt_effects_log")
        .withIndex("by_entity", q => q.eq("entityId", entityId))
        .collect();
    }
    return await ctx.db.query("demo_gt_effects_log").collect();
  },
});
```

### getMachineDefinition
Returns a JSON-serializable `MachineSnapshot` object. Extract states/events/guards/actions from the machine config.

```typescript
interface MachineSnapshot {
  id: string;
  initial: string;
  states: Record<string, {
    type?: "final";
    on: Record<string, {
      target: string;
      guard?: string;
      actions?: string[];
    }>;
  }>;
  allStates: string[];
  allEvents: string[];
  allGuards: string[];
  allActions: string[];
}

export const getMachineDefinition = query({
  args: {},
  handler: async () => {
    const machine = machineRegistry.loanApplication;
    const config = machine.config;

    // Extract states from config
    // Walk config.states to build the MachineSnapshot shape
    // For each state, iterate its `on` entries to get events, guards, actions
    // Return the serializable snapshot
  },
});
```

**Implementation hint:** `machine.config` gives you the raw config object. Walk `config.states` — each state has an `on` property with event definitions. Each event definition has `target`, optionally `guard` (string name), optionally `actions` (array of string names or action objects).

## Internal Functions

### executeEffect
```typescript
export const executeEffect = internalMutation({
  args: {
    entityId: v.id("demo_gt_entities"),
    journalEntryId: v.id("demo_gt_journal"),
    effectName: v.string(),
  },
  handler: async (ctx, { entityId, journalEntryId, effectName }) => {
    await ctx.db.insert("demo_gt_effects_log", {
      entityId,
      journalEntryId,
      effectName,
      status: "completed",
      scheduledAt: Date.now(),
      completedAt: Date.now(),
    });
  },
});
```

### hashChainJournalEntry

Import `AuditTrail` from `../auditTrailClient` and `components` from `../_generated/api`. Instantiate: `const auditTrail = new AuditTrail(components.auditTrail);`

Reference pattern from `convex/demo/auditTraceability.ts` lines 44 and 109-117:
```typescript
// Line 44:
const auditTrail = new AuditTrail(components.auditTrail);

// Lines 109-117:
await auditTrail.insert(ctx, {
  entityId,
  entityType: "demo_audit_mortgages",
  eventType,
  actorId,
  beforeState,
  afterState,
  timestamp,
});
```

The `AuditTrail` class (from `convex/auditTrailClient.ts`) has this insert signature:
```typescript
async insert(ctx: MutationCtx, event: {
  entityId: string;
  entityType: string;
  eventType: string;
  actorId: string;
  beforeState?: string;
  afterState?: string;
  metadata?: string;
  timestamp: number;
}): Promise<string>
```

Implementation:
```typescript
export const hashChainJournalEntry = internalMutation({
  args: { journalEntryId: v.id("demo_gt_journal") },
  handler: async (ctx, { journalEntryId }) => {
    const entry = await ctx.db.get(journalEntryId);
    if (!entry) return;

    await auditTrail.insert(ctx, {
      entityId: entry.entityId as string,
      entityType: entry.entityType,
      eventType: entry.eventType,
      actorId: entry.source.actorId ?? "demo-anonymous",
      beforeState: JSON.stringify({ status: entry.previousState }),
      afterState: JSON.stringify({ status: entry.newState }),
      metadata: JSON.stringify({
        outcome: entry.outcome,
        source: entry.source,
        effectsScheduled: entry.effectsScheduled,
      }),
      timestamp: entry.timestamp,
    });
  },
});
```

## resetDemo Mutation

```typescript
export const resetDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const entities = await ctx.db.query("demo_gt_entities").collect();
    for (const e of entities) await ctx.db.delete(e._id);

    const journal = await ctx.db.query("demo_gt_journal").collect();
    for (const j of journal) await ctx.db.delete(j._id);

    const effects = await ctx.db.query("demo_gt_effects_log").collect();
    for (const ef of effects) await ctx.db.delete(ef._id);
  },
});
```

## Machine Unit Tests

File: `convex/demo/machines/__tests__/loanApplication.test.ts`

Because machine definitions are pure data, they can be tested with Vitest — no Convex runtime needed.

```typescript
import { describe, it, expect } from "vitest";
import { loanApplicationMachine } from "../loanApplication.machine";

describe("loanApplication machine", () => {
  const hydrate = (state: string, data?: Record<string, unknown>) =>
    loanApplicationMachine.resolveState({
      value: state,
      context: { entityId: "test", data },
    });

  it("transitions draft → submitted on SUBMIT with valid data", () => {
    const state = hydrate("draft", { applicantName: "Alice", loanAmount: 100000 });
    const next = loanApplicationMachine.transition(state, { type: "SUBMIT" });
    expect(next.value).toBe("submitted");
  });

  it("rejects SUBMIT from draft when data is incomplete", () => {
    const state = hydrate("draft", {});
    const next = loanApplicationMachine.transition(state, { type: "SUBMIT" });
    expect(next.value).toBe("draft"); // unchanged — guard failed
  });

  it("rejects APPROVE from draft (invalid event for state)", () => {
    const state = hydrate("draft", { applicantName: "Alice", loanAmount: 100000 });
    const next = loanApplicationMachine.transition(state, { type: "APPROVE" });
    expect(next.value).toBe("draft"); // unchanged
  });

  it("cannot escape terminal state (closed)", () => {
    const allEvents = ["SUBMIT", "ASSIGN_REVIEWER", "APPROVE", "REJECT",
                       "REQUEST_INFO", "RESUBMIT", "REOPEN", "FUND", "CLOSE"];
    const state = hydrate("closed");
    for (const eventType of allEvents) {
      const next = loanApplicationMachine.transition(state, { type: eventType });
      expect(next.value).toBe("closed");
    }
  });

  it("allows rejected → draft via REOPEN", () => {
    const state = hydrate("rejected");
    const next = loanApplicationMachine.transition(state, { type: "REOPEN" });
    expect(next.value).toBe("draft");
  });
});
```

Add more tests for:
- All valid transitions from each state (the full transition table)
- `submitted → under_review` via ASSIGN_REVIEWER
- `under_review → approved/rejected/needs_info` via APPROVE/REJECT/REQUEST_INFO
- `needs_info → under_review` via RESUBMIT
- `approved → funded` via FUND
- `funded → closed` via CLOSE
- Actions are reported (e.g., SUBMIT produces "notifyReviewer" action)

## Imports Needed

At the top of `governedTransitions.ts`, ensure these imports exist:
```typescript
import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { internal, components } from "../_generated/api";
import { machineRegistry, type EntityType } from "./machines/registry";
import { AuditTrail } from "../auditTrailClient";
```

And instantiate:
```typescript
const auditTrail = new AuditTrail(components.auditTrail);
```

## Quality Gate

After completing all tasks, run:
- `bun check` (auto-formats + lints)
- `bun typecheck` (TypeScript type checking)
- Fix any issues that arise.
