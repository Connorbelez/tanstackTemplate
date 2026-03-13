# Governed Transitions Demo — Design

> Derived from: https://www.notion.so/313fc1b440248189a811ee4c5e551798

## Types & Interfaces

```typescript
// ── Command Envelope ─────────────────────────────────
// The source is metadata, not control flow. The machine receives the same
// event type regardless of source. Source is written to the journal for audit.
interface CommandSource {
  channel: "borrower_portal" | "broker_portal" | "admin_dashboard" | "api_webhook" | "scheduler";
  actorId?: string;
  actorType?: "borrower" | "broker" | "admin" | "system";
  sessionId?: string;
  ip?: string; // Optional — included in demo to show audit context. Seed data uses RFC-5737 TEST-NET addresses.
}

interface Command {
  entityId: Id<"demo_gt_entities">;  // Convex document ID
  eventType: string;                 // Maps to an XState event type
  payload?: unknown;                 // Event-specific data
  source: CommandSource;             // Who is asking (for audit, not for branching)
}

// ── Transition Result ────────────────────────────────
interface TransitionResult {
  success: boolean;
  previousState: string;
  newState: string;
  reason?: string;           // Only on rejection
  effectsScheduled?: string[];
}

// ── Journal Entry ────────────────────────────────────
interface JournalEntry {
  entityType: string;
  entityId: Id<"demo_gt_entities">;
  eventType: string;
  payload?: unknown;
  previousState: string;
  newState: string;             // Same as previousState on rejection
  outcome: "transitioned" | "rejected";
  reason?: string;
  source: CommandSource;
  machineVersion?: string;
  timestamp: number;
  effectsScheduled?: string[];
}

// ── Machine Snapshot (JSON-serializable for frontend) ─
// Extracted from XState machine config — no functions, just data.
interface MachineSnapshot {
  id: string;                   // Machine ID (e.g. "loanApplication")
  initial: string;              // Initial state name
  states: Record<string, {
    type?: "final";             // Terminal states
    on: Record<string, {        // Event name → transition info
      target: string;
      guard?: string;           // Guard name (string reference)
      actions?: string[];       // Action names (string references)
    }>;
  }>;
  // Flat lists for the frontend to enumerate
  allStates: string[];
  allEvents: string[];
  allGuards: string[];
  allActions: string[];
}
```

## Database Schema

```typescript
// convex/schema.ts additions — add to the demo tables section
// (after the existing demo_audit_mortgages table definition)

// ── Demo Governed Transitions ───────────────────────────
demo_gt_entities: defineTable({
  entityType: v.string(),
  label: v.string(),
  status: v.string(),
  machineContext: v.optional(v.any()),
  lastTransitionAt: v.optional(v.number()),
  data: v.optional(v.any()),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_type", ["entityType"]),

demo_gt_journal: defineTable({
  entityType: v.string(),
  entityId: v.id("demo_gt_entities"),
  eventType: v.string(),
  payload: v.optional(v.any()),
  previousState: v.string(),
  newState: v.string(),
  outcome: v.union(v.literal("transitioned"), v.literal("rejected")),
  reason: v.optional(v.string()),
  source: v.object({
    channel: v.string(),
    actorId: v.optional(v.string()),
    actorType: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  }),
  machineVersion: v.optional(v.string()),
  timestamp: v.number(),
  effectsScheduled: v.optional(v.array(v.string())),
})
  .index("by_entity", ["entityId", "timestamp"])
  .index("by_outcome", ["outcome", "timestamp"]),

demo_gt_effects_log: defineTable({
  entityId: v.id("demo_gt_entities"),
  journalEntryId: v.id("demo_gt_journal"),
  effectName: v.string(),
  status: v.union(
    v.literal("scheduled"),
    v.literal("completed"),
    v.literal("failed"),
  ),
  scheduledAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_entity", ["entityId"])
  .index("by_journal", ["journalEntryId"]),
```

The `channel` field uses `v.string()` in the Convex schema for flexibility, but is typed as a string union in TypeScript interfaces for IntelliSense and compile-time safety.

## Architecture

### Complete Machine Definition — Loan Application

The machine file lives at `convex/demo/machines/loanApplication.machine.ts`. It has **zero Convex imports** — only `import { setup } from "xstate"`.

#### State Transition Table

| From State     | Event            | Guard             | To State       | Actions (Effects)                       |
| -------------- | ---------------- | ----------------- | -------------- | --------------------------------------- |
| draft          | SUBMIT           | hasCompleteData   | submitted      | notifyReviewer                          |
| submitted      | ASSIGN_REVIEWER  | —                 | under_review   | —                                       |
| under_review   | APPROVE          | —                 | approved       | notifyApplicant                         |
| under_review   | REJECT           | —                 | rejected       | notifyApplicant                         |
| under_review   | REQUEST_INFO     | —                 | needs_info     | notifyApplicant                         |
| needs_info     | RESUBMIT         | —                 | under_review   | notifyReviewer                          |
| rejected       | REOPEN           | —                 | draft          | —                                       |
| approved       | FUND             | —                 | funded         | scheduleFunding, generateDocuments      |
| funded         | CLOSE            | —                 | closed         | —                                       |

**Terminal states:** `closed` (`{ type: "final" }`)

**Non-terminal dead-end note:** `rejected` is NOT terminal — it can be reopened back to `draft` via `REOPEN`. This is intentional for the demo to show the reopening pattern.

#### Guard Definition

`hasCompleteData`: Checks that `context.data` contains a non-empty `applicantName` string and a `loanAmount` number greater than 0. Reads from `context` (the entity's `data` field, merged during state hydration at load time) — **not** from the event payload. This guard runs on `SUBMIT` to prevent incomplete applications from advancing.

> **POC note:** In this demo, `applicantName` and `loanAmount` are written to the entity at creation time and hydrated into machine context before the guard runs — the `SUBMIT` event itself carries no payload. In a production implementation you may instead want to pass these fields on the `SUBMIT` event payload (e.g. a form submission carries the latest values), which would require the guard to read from `event` rather than `context.data`. Revisit this design decision before promoting to production.

```typescript
guards: {
  hasCompleteData: ({ context }) => {
    const data = context.data;
    return (
      data != null &&
      typeof data.applicantName === "string" &&
      data.applicantName.length > 0 &&
      typeof data.loanAmount === "number" &&
      data.loanAmount > 0
    );
  },
},
```

Note: The guard reads from `context` (which contains the entity's `data` field merged in during hydration), NOT from the event payload. This keeps the guard pure and consistent with the pattern.

#### Complete Machine Code

```typescript
// convex/demo/machines/loanApplication.machine.ts
import { setup } from "xstate";

export const loanApplicationMachine = setup({
  types: {
    context: {} as {
      entityId: string;
      data?: {
        applicantName?: string;
        loanAmount?: number;
      };
    },
    events: {} as
      | { type: "SUBMIT" }
      | { type: "ASSIGN_REVIEWER" }
      | { type: "APPROVE" }
      | { type: "REJECT" }
      | { type: "REQUEST_INFO" }
      | { type: "RESUBMIT" }
      | { type: "REOPEN" }
      | { type: "FUND" }
      | { type: "CLOSE" },
  },
  guards: {
    hasCompleteData: ({ context }) => {
      const data = context.data;
      return (
        data != null &&
        typeof data.applicantName === "string" &&
        data.applicantName.length > 0 &&
        typeof data.loanAmount === "number" &&
        data.loanAmount > 0
      );
    },
  },
}).createMachine({
  id: "loanApplication",
  initial: "draft",
  states: {
    draft: {
      on: {
        SUBMIT: {
          target: "submitted",
          guard: "hasCompleteData",
          actions: ["notifyReviewer"],
        },
      },
    },
    submitted: {
      on: {
        ASSIGN_REVIEWER: {
          target: "under_review",
        },
      },
    },
    under_review: {
      on: {
        APPROVE: {
          target: "approved",
          actions: ["notifyApplicant"],
        },
        REJECT: {
          target: "rejected",
          actions: ["notifyApplicant"],
        },
        REQUEST_INFO: {
          target: "needs_info",
          actions: ["notifyApplicant"],
        },
      },
    },
    needs_info: {
      on: {
        RESUBMIT: {
          target: "under_review",
          actions: ["notifyReviewer"],
        },
      },
    },
    approved: {
      on: {
        FUND: {
          target: "funded",
          actions: ["scheduleFunding", "generateDocuments"],
        },
      },
    },
    rejected: {
      on: {
        REOPEN: {
          target: "draft",
        },
      },
    },
    funded: {
      on: {
        CLOSE: {
          target: "closed",
        },
      },
    },
    closed: { type: "final" },
  },
});
```

### Machine Registry

```typescript
// convex/demo/machines/registry.ts
import { loanApplicationMachine } from "./loanApplication.machine";

export const machineRegistry = {
  loanApplication: loanApplicationMachine,
} as const;

export type EntityType = keyof typeof machineRegistry;
```

### Transition Engine Implementation

The `transition` mutation is the **only code path** that modifies an entity's `status` field. Here is the exact algorithm:

```typescript
// convex/demo/governedTransitions.ts (the transition mutation)
// Imports needed:
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
    //    resolveState() creates a State object from a plain value + context
    const restoredState = machineDef.resolveState({
      value: previousState,
      context: {
        entityId: entityId as string,
        data: entity.data,
        ...(entity.machineContext ?? {}),
      },
    });

    // 4. Compute transition (PURE — no side effects)
    //    transition() is a pure function: State × Event → State
    const event = { type: eventType, ...payload };
    const nextState = machineDef.transition(restoredState, event);

    // 5. Check if transition actually occurred
    //    If the state value is unchanged, the command was rejected
    const newStatus = typeof nextState.value === "string"
      ? nextState.value
      : JSON.stringify(nextState.value); // handles parallel/nested states
    const transitioned = newStatus !== previousState;

    if (!transitioned) {
      // 5a. Command rejected — log to journal and return
      await ctx.db.insert("demo_gt_journal", {
        entityType,
        entityId,
        eventType,
        payload,
        previousState,
        newState: previousState, // unchanged
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

    // 6. Persist new state (ATOMIC with journal write below — same mutation)
    await ctx.db.patch(entityId, {
      status: newStatus,
      machineContext: nextState.context,
      lastTransitionAt: Date.now(),
    });

    // 7. Collect declared effects (action names from the machine)
    const effectNames = (nextState.actions ?? [])
      .map((a: { type: string }) => a.type)
      .filter((name: string) => name !== "xstate.stop" && !name.startsWith("xstate."));

    // 8. Write journal entry (ATOMIC with entity patch — same mutation)
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

**Critical invariant (Rule 2):** No other code in this file or any other file may call `ctx.db.patch(id, { status: "..." })` on `demo_gt_entities`. All status changes flow through this mutation. The `runFullLifecycle` mutation is the one exception — it reuses the same transition logic inline (not by calling the exported mutation, since Convex mutations can't call other mutations directly — instead, duplicate the hydrate/validate/persist/journal logic).

### Layered Audit Architecture

The demo implements 2 of the 4 layers from the production spec:

```
transition mutation:
  ├── ctx.db.patch(entity, { status })           ← atomic (same mutation)
  ├── ctx.db.insert("demo_gt_journal", {...})    ← atomic (same mutation)
  └── ctx.scheduler.runAfter(0, hashChainEffect) ← fire-and-forget
        └── auditTrail.insert(...)               ← tamper-evidence copy (Layer 2)
```

**Layer 1: `demo_gt_journal` table (Primary Record)**
Written atomically in the same mutation as the entity patch. This guarantees that if the entity state changed, there IS a journal entry. No transaction gap. This is why the journal is a first-class Convex table in the main schema, NOT a component — component writes cannot be atomic with the entity patch.

**Layer 2: `auditTrail` component (Tamper Evidence)**
Receives a copy via `ctx.scheduler.runAfter(0, ...)`. Hash-chained with SHA-256 for cryptographic tamper detection. Component-isolated (host `ctx.db` cannot modify audit entries). If the scheduled function fails, the primary record (Layer 1) is intact and Convex will retry the scheduled function.

### AuditTrail Integration

```typescript
// At the top of convex/demo/governedTransitions.ts:
import { AuditTrail } from "../auditTrailClient";
import { components } from "../_generated/api";

const auditTrail = new AuditTrail(components.auditTrail);

// The hashChainJournalEntry internal mutation:
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

### Effect Simulation

```typescript
// In convex/demo/governedTransitions.ts:
export const executeEffect = internalMutation({
  args: {
    entityId: v.id("demo_gt_entities"),
    journalEntryId: v.id("demo_gt_journal"),
    effectName: v.string(),
  },
  handler: async (ctx, { entityId, journalEntryId, effectName }) => {
    // Log the effect as completed (simulated — real effects would call APIs)
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

### Data Flow

```
User Action (UI)
  → Command Envelope { eventType, entityId, source }
  → transition mutation (Convex)
      1. Load entity from demo_gt_entities (ctx.db.get)
      2. Get machine from registry (machineRegistry[entityType])
      3. Hydrate to current state (machineDef.resolveState({ value, context }))
      4. Compute transition (machineDef.transition(state, event)) — PURE
      5. Check: nextState.value === previousState? → REJECTED
         5a. Insert journal entry with outcome="rejected", reason — return
      6. Persist new state (ctx.db.patch) — ATOMIC with step 8
      7. Extract action names: nextState.actions.map(a => a.type)
      8. Write journal entry (ctx.db.insert) — ATOMIC with step 6
      9. Schedule effects (ctx.scheduler.runAfter for each action)
      10. Schedule hash-chain copy (ctx.scheduler.runAfter)
  → Return TransitionResult { success, previousState, newState, reason?, effectsScheduled? }
  → UI updates reactively via useQuery subscriptions
```

### File Structure

```
convex/demo/
  governedTransitions.ts              — All queries, mutations, internal functions
  machines/
    loanApplication.machine.ts        — Pure XState v5 machine definition (zero Convex imports)
    registry.ts                       — Machine type → definition map
    __tests__/
      loanApplication.test.ts         — Vitest unit tests (pure, no Convex runtime)

src/routes/demo/governed-transitions/
  route.tsx                           — Layout with nav tabs (pattern: audit-traceability/route.tsx)
  index.tsx                           — Command Center: entity list + command panel
  journal.tsx                         — Audit Journal viewer
  machine.tsx                         — Machine Inspector / state visualization
```

### API Surface

#### Reads (Queries)

| Function              | Args                                                 | Returns                                          | Description                              |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| listEntities          | {}                                                   | Doc<"demo_gt_entities">[]                        | All entities, ordered by createdAt desc  |
| getEntity             | { id: v.id("demo_gt_entities") }                     | Doc<"demo_gt_entities"> \| null                  | Single entity by ID                      |
| getJournal            | { entityId?: v.id("demo_gt_entities"), outcome?: v.string() } | Doc<"demo_gt_journal">[]                | Journal entries, filtered, desc by time  |
| getJournalStats       | {}                                                   | { total: number, transitioned: number, rejected: number } | Aggregate counts              |
| getValidTransitions   | { entityId: v.id("demo_gt_entities") }               | string[]                                         | Event types that produce valid transition from current state |
| getEffectsLog         | { entityId?: v.id("demo_gt_entities") }              | Doc<"demo_gt_effects_log">[]                     | Effects log, optionally filtered         |
| getMachineDefinition  | {}                                                   | MachineSnapshot                                  | Serialized machine for frontend visualization |

**`getValidTransitions` implementation notes:**
Hydrate the machine to the entity's current state, then test every event type from the machine's event union. For each event, call `machineDef.transition(state, { type: eventType })` — if the resulting state value differs from the current state, the event is valid. Return the list of valid event type strings.

**`getMachineDefinition` implementation notes:**
Extract the machine structure from `loanApplicationMachine.config`. Walk the `states` object to build the `MachineSnapshot` shape. For each state, iterate `on` entries to extract event names, target states, guard names, and action names. This is a pure extraction — no runtime computation needed.

#### Writes (Mutations)

| Function              | Args                                                                        | Returns                        | Description                           |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------ | ------------------------------------- |
| createEntity          | { label: v.string(), loanAmount: v.number(), applicantName?: v.string() }   | v.id("demo_gt_entities")      | Create entity in "draft" state. Hardcodes entityType: "loanApplication". Stores loanAmount + applicantName in `data` field. |
| transition            | { entityId: v.id("demo_gt_entities"), eventType: v.string(), payload?: v.any(), source: v.object({...}) } | TransitionResult | THE single transition code path |
| runFullLifecycle      | {}                                                                          | { entityId: v.id("demo_gt_entities"), journalEntries: number } | Creates entity + 5 transitions in one mutation |
| seedEntities          | {}                                                                          | void                           | Idempotent. Creates 3 sample entities if none exist. |
| resetDemo             | {}                                                                          | void                           | Deletes all demo_gt_* documents       |

#### Internal Functions (Scheduled)

| Function              | Args                                               | Type             | Description                          |
| --------------------- | -------------------------------------------------- | ---------------- | ------------------------------------ |
| executeEffect         | { entityId, journalEntryId, effectName }           | internalMutation | Simulated effect — logs to demo_gt_effects_log |
| hashChainJournalEntry | { journalEntryId: v.id("demo_gt_journal") }       | internalMutation | Copies journal entry to auditTrail component |

### Routing

Follow TanStack Router file-based routing. Each page file exports `Route = createFileRoute('/demo/governed-transitions/...')({ ssr: false, component: ... })`. Pattern reference: `src/routes/demo/audit-traceability/`.

| Path                                   | File               | Component         | Description                  |
| -------------------------------------- | ------------------ | ----------------- | ---------------------------- |
| /demo/governed-transitions             | route.tsx          | Layout            | Layout with nav tabs + Outlet |
| /demo/governed-transitions/            | index.tsx          | CommandCenter     | Entity list + command panel  |
| /demo/governed-transitions/journal     | journal.tsx        | JournalViewer     | Audit journal                |
| /demo/governed-transitions/machine     | machine.tsx        | MachineInspector  | State diagram + transition table |

### Frontend Component Details

#### CommandCenter (index.tsx)

**Layout:** Two-column grid on lg screens.

**Left column:**
- Create Entity form: Label (Input), Loan Amount (Input type=number), Applicant Name (Input, optional). Button "Create Application".
- Action buttons row: "Seed Data" (outline), "Run Full Lifecycle" (outline), "Reset Demo" (destructive outline).

**Right column:**
- Entity list as Cards. Each card shows:
  - Label (font-medium)
  - Status as Badge (color-coded: draft=secondary, submitted=outline, under_review=default, approved=default, rejected=destructive, needs_info=secondary, funded=default, closed=outline)
  - Loan amount formatted as currency
  - When selected (clicked), card expands to show:
    - **Valid transitions** from `getValidTransitions`: rendered as green Buttons
    - **All events** section: all 9 event types shown. Valid ones are green, invalid ones are gray/disabled with `cursor-not-allowed`. Clicking an invalid one still calls `transition` to demonstrate rejection logging.
    - **Source selector**: Select/dropdown with options: borrower_portal, broker_portal, admin_dashboard, api_webhook, scheduler. Default: admin_dashboard.
    - After sending a command: show toast or inline message with the TransitionResult (success/rejection reason).

**Imports:**
```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { api } from "../../../../convex/_generated/api";
```

#### JournalViewer (journal.tsx)

**Top bar:** Stats from `getJournalStats` — three stat cards showing Total, Transitioned (green), Rejected (red) counts.

**Filters row:** Entity dropdown (from `listEntities`, with "All" option), Outcome toggle buttons (All / Transitioned / Rejected).

**Journal list:** Reverse-chronological cards. Each entry shows:
- Event type in monospace bold
- Previous state → New state with arrow icon (ArrowRight from lucide)
- Outcome Badge: green "transitioned" or red "rejected"
- Source: channel + actorType + actorId
- Timestamp (formatted relative or absolute)
- If rejected: reason in muted text
- If effects scheduled: list of effect names as small badges

#### MachineInspector (machine.tsx)

**Section 1: State Diagram**
Render states as styled div nodes in a CSS grid or flex flow layout. Each state node:
- Name label
- Border color: green if current entity state, gray otherwise
- "FINAL" badge on terminal states
- Outgoing transition arrows/lines to target states with event name labels

Use HTML/CSS for the diagram (no external library needed). Arrange states roughly in the lifecycle flow: draft → submitted → under_review → (approved | rejected | needs_info) → funded → closed.

**Section 2: Transition Table**
Full HTML table with columns: From State, Event, Guard, To State, Actions. Populated from `getMachineDefinition` query. Sortable or grouped by from-state.

## Implementation Decisions

1. **Single machine type for demo**: The spec defines 9+ entity types in a registry. For the demo, we use one (loanApplication) to keep it focused. The registry pattern is still used — just with one entry.

2. **XState v5 pure computation**: We use `machineDef.transition()` (pure function) rather than `createActor()` (stateful). This matches the spec's approach — hydrate to current state, compute transition, check result. No actor lifecycle management. Machine file imports: `import { setup } from "xstate"`. Engine file: no xstate imports needed — calls methods on the machine object directly.

3. **Simulated effects**: Real effects would email, call APIs, etc. Demo effects are `internalMutation`s that write to `demo_gt_effects_log` with immediate "completed" status, demonstrating the fire-and-forget scheduling pattern without real side effects.

4. **Hash-chain integration**: We reuse the existing `auditTrail` component from the Audit & Traceability demo. Import `AuditTrail` from `../auditTrailClient`, instantiate with `components.auditTrail`. The hash-chain copy is scheduled via `ctx.scheduler.runAfter(0, ...)` — not inline in the transition mutation.

5. **No triggers needed**: Unlike the Audit & Traceability demo which uses `convex-helpers/server/triggers` for automatic audit on DB writes, the Governed Transitions demo does NOT need triggers. The Transition Engine is the single code path for all status changes, so audit capture is built into the engine itself.

6. **Raw mutation/query, no fluent builder**: Demo uses `mutation`/`query`/`internalMutation` from `convex/_generated/server` rather than the fluent builder from `convex/fluent.ts`, since the demo doesn't require authentication middleware. This follows the pattern of simpler demos like `aggregate.ts`.

7. **State visualization**: Rather than embedding a full state chart renderer (like @statelyai/inspect), we build a simple HTML/CSS visualization of the machine states and transitions, with the current state highlighted. This keeps the demo self-contained with no extra dependencies.

8. **Schema channel typing**: The `channel` field uses `v.string()` in the Convex schema validator for flexibility but is typed as a string union in TypeScript interfaces for IntelliSense. A `v.union(v.literal(...))` for 5 values is verbose and brittle for a demo.

9. **`runFullLifecycle` as single mutation**: All 5 transitions execute sequentially in one mutation (no `ctx.scheduler.runAfter` between steps). This works because Convex mutations are atomic. The transition logic is duplicated inline (Convex mutations can't call other exported mutations directly). Each step writes its own journal entry.

## Testing

### Machine Unit Tests

Because machine definitions are pure data, they can be tested exhaustively with Vitest — no Convex runtime, no database, no network:

```typescript
// convex/demo/machines/__tests__/loanApplication.test.ts
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

## Addendum — Demo Route UI Refinement

This addendum refines the frontend architecture for the demo route while preserving the existing backend, route, and state-model design. In case of conflict, the guidance below supersedes earlier generic UI implementation notes.

### UI Adaptation Strategy

The demo route keeps the current three-surface structure:

- **Command Center**: interactive, mutative, and command-oriented
- **Journal**: read-only observer surface
- **Machine**: read-only observer surface

The key refinement is that the Journal and Machine surfaces should explicitly leverage the two existing reusable UI components already present in the codebase:

- `InteractiveLogsTable` for audit/journal visualization
- `N8nWorkflowBlock` for machine/state visualization

These reused components must be treated as presentation shells fed by governed-transitions-specific adapter/view-model layers.

### Frontend Wrappers

Create governed-transitions-specific wrappers rather than coupling the route directly to the raw reusable components:

- `GovernedTransitionsJournalView`
- `GovernedTransitionsMachineView`

These wrappers are responsible for:

- querying governed-transitions data
- adapting domain records into the prop/data shape expected by the reusable component
- suppressing or removing any mutative affordances from the underlying component
- presenting domain language that matches the governed-transitions demo

### Journal Adapter

`GovernedTransitionsJournalView` should adapt `demo_gt_journal` entries into a log-table-style read model.

Recommended mapping:

- `eventType` → primary log message/title
- `outcome` → severity/level styling (`transitioned` vs `rejected`)
- `source.channel` → service/source label
- `previousState` and `newState` → compact transition summary
- `timestamp` → log timestamp
- `reason` and `effectsScheduled` → expanded detail content

The Journal surface may support:

- search
- outcome/source filtering
- row expansion
- entity scoping

The Journal surface may not support:

- command dispatch
- inline editing
- delete/reset actions
- any mutation-triggering affordance

### Machine Adapter

`GovernedTransitionsMachineView` should adapt `MachineSnapshot` and selected-entity state into a read-only workflow/state visualization.

Recommended mapping:

- machine states → workflow nodes
- allowed transitions → workflow connections
- current entity state → highlighted active node
- terminal state (`closed`) → terminal/final styling
- guard and action metadata → secondary labels or inspector detail

The Machine surface must be configured as read-only even if the base component supports authoring behaviors.

The Machine surface may support:

- current-state highlighting
- hover/inspection details
- entity selection context
- static legend or transition metadata

The Machine surface may not support:

- dragging nodes
- adding nodes
- editing edges
- rearranging topology
- any mutation-triggering affordance

### Component Behavior Constraints

If the base reusable components currently expose edit-like behaviors, the governed-transitions wrappers must disable, hide, or bypass them.

Specifically:

- `InteractiveLogsTable` should be used as a searchable/filterable inspection surface only.
- `N8nWorkflowBlock` should be rendered in a non-authoring mode that removes builder interactions from the governed-transitions experience.

### Refined Page Responsibilities

#### CommandCenter

The Command Center remains the sole mutative UI surface. It is responsible for:

- entity creation
- entity selection
- displaying available/all event options
- source channel selection
- command submission
- seed/reset/full lifecycle actions

It is explicitly not responsible for rendering the complete audit trail or machine topology beyond lightweight summary context.

#### JournalViewer

The Journal route/page should be implemented as a governed-transitions-specific wrapper around `InteractiveLogsTable`, with domain mapping for journal and audit semantics.

#### MachineInspector

The Machine route/page should be implemented as a governed-transitions-specific wrapper around `N8nWorkflowBlock`, with domain mapping for machine-state semantics and read-only behavior constraints.

### Verification Criteria

The frontend implementation should be considered correct only if all of the following are true:

- commands can only be dispatched from the Command Center
- Journal interactions are limited to viewing, filtering, searching, and expanding details
- Machine interactions are limited to viewing and inspection
- neither Journal nor Machine can directly mutate Convex data
- observer surfaces reactively update after Command Center actions complete

### Testing Additions

Add explicit test coverage for the observer/mutator boundary:

- Journal view does not expose command or mutation controls
- Machine view does not expose builder/edit controls
- Command Center remains the only command-entry surface
- Journal and Machine both update after a successful transition
- rejected transitions appear in the Journal observer view with the proper rejection detail
