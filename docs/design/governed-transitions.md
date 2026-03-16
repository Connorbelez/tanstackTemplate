# Governed Transitions — Updated Design

## Overview

The Governed Transitions system is the central mechanism for all status/state changes in FairLend. No entity's status is ever patched directly — every change flows through a **Transition Engine** that validates, executes, and journals the transition atomically.

## Five Components

### 1. Machine Definitions (Static Config)

Each entity type (application, mortgage, servicing account, etc.) has a machine definition that declares:

- **States**: The set of valid statuses
- **Events**: Named triggers (e.g., `SUBMIT`, `APPROVE`, `FUND`)
- **Transitions**: `fromState + event → toState` mappings
- **Guards**: Conditions that must be true for the transition to proceed (sync, pure functions)
- **Effects**: Side-effects to schedule after a successful transition (async, fire-and-forget)
- **Machine Version**: Semver string for audit trail correlation

Machine definitions are **pure data** — no database access, no side effects. They're imported by the Transition Engine at call time.

```typescript
// Example: Provisional Application Machine
export const provisionalApplicationMachine = {
  version: "1.0.0",
  initial: "draft",
  states: {
    draft: {
      on: {
        SUBMIT: { target: "submitted", guards: ["hasRequiredFields"] },
        ABANDON: { target: "abandoned" },
      },
    },
    submitted: {
      on: {
        APPROVE: { target: "approved", guards: ["meetsMinimumCriteria"] },
        REJECT: { target: "rejected" },
        RETURN: { target: "draft" },
      },
    },
    approved: {
      on: {
        CONVERT: { target: "converted", effects: ["createFullApplication"] },
        EXPIRE: { target: "expired" },
      },
    },
    rejected: { type: "final" },
    abandoned: { type: "final" },
    converted: { type: "final" },
    expired: { type: "final" },
  },
} as const;
```

### 2. Guard Registry

Guards are pure synchronous functions that receive the entity + command context and return `{ allowed: true }` or `{ allowed: false, reason: string }`.

```typescript
const guardRegistry = {
  hasRequiredFields: (entity, command) => {
    if (!entity.borrowerName || !entity.loanAmount) {
      return { allowed: false, reason: "Missing required fields" };
    }
    return { allowed: true };
  },
  meetsMinimumCriteria: (entity, command) => {
    // Business logic validation
    return { allowed: true };
  },
};
```

Guards never touch the database. If a guard needs data beyond the entity itself, the caller must include it in the command payload.

### 3. Transition Engine (The Single Mutation)

The engine is a **generic Convex mutation** that:

1. Loads the entity by `entityType` + `entityId`
2. Looks up the machine definition for that entity type
3. Finds the transition for `currentState + event`
4. Runs all guards — if any reject, writes a **rejected** journal entry and returns
5. Patches the entity's status (and optional `machineContext`)
6. Writes the **auditJournal** entry atomically in the same mutation
7. Schedules any effects via `ctx.scheduler.runAfter`
8. Schedules the hash-chain copy to the auditTrail component (fire-and-forget)

```typescript
// Calling the engine — every caller constructs a Command
await ctx.runMutation(api.transitions.execute, {
  entityType: "provisionalApplication",
  entityId: appId,
  event: "SUBMIT",
  payload: { submittedBy: userId },
  source: {
    channel: "web",
    actorId: userId,
    actorType: "user",
    sessionId,
  },
});
```

**Critical invariant**: The entity patch and journal entry are in the **same mutation**. If one fails, both fail. There is never a transition without a receipt.

### 4. Audit Journal (First-Class Convex Table)

The audit journal is a **regular Convex table** in the main schema — not a component. This is a deliberate choice for atomicity.

```typescript
auditJournal: defineTable({
  entityType: v.string(),
  entityId: v.string(),
  eventType: v.string(),
  previousState: v.string(),
  newState: v.string(),
  outcome: v.union(v.literal("transitioned"), v.literal("rejected")),
  reason: v.optional(v.string()),
  payload: v.optional(v.any()), // Event-specific data, any shape
  source: v.object({
    channel: v.string(),
    actorId: v.string(),
    actorType: v.string(),
    ip: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  }),
  machineVersion: v.optional(v.string()),
  timestamp: v.number(),
})
  .index("by_entity", ["entityType", "entityId", "timestamp"])
  .index("by_event", ["eventType", "timestamp"])
  .index("by_outcome", ["outcome", "timestamp"])
  .index("by_actor", ["source.actorId", "timestamp"])
```

**Key design decisions:**

- **Fixed fields** (`entityType`, `previousState`, `newState`, `outcome`) are indexed and queryable — "show me all rejected transitions for mortgage X"
- **`payload`** is `v.any()` — a JSON blob for event-specific data (triage results, payment amounts, waiver reasons). Never queried operationally; exists for deep auditor inspection.
- **Records rejections**: An auditor sees not just what happened, but what was attempted and denied. This is a regulatory requirement.
- **5-year retention** target for compliance.

### 5. Effect Registry

Effects are async functions scheduled via `ctx.scheduler.runAfter(0, ...)` after a successful transition. They handle side-effects like:

- Creating downstream entities (e.g., `CONVERT` creates a full application)
- Sending notifications
- Triggering integrations
- Scheduling follow-up timers (e.g., auto-expire after 30 days)

Effects are fire-and-forget from the engine's perspective. Failures are logged but don't roll back the transition.

---

## Audit Architecture (Layered)

```
Transition Engine mutation:
  ├── ctx.db.patch(entity, { status, machineContext })     ← atomic
  ├── ctx.db.insert("auditJournal", { ... })               ← atomic (same mutation)
  └── ctx.scheduler.runAfter(0, hashChainEffect)           ← fire-and-forget
        └── auditTrail.insert(...)                         ← tamper-evidence copy
```

### Layer 1: auditJournal table (Primary Record)

- Written atomically with every transition
- Source of truth for auditors and compliance
- Queryable by entity, event, outcome, actor
- Records both successful transitions and rejections

### Layer 2: auditTrail component (Tamper Evidence)

- Receives a copy of each journal entry via scheduled function
- SHA-256 hash-chained for cryptographic tamper detection
- Component-isolated (host code can't modify entries)
- If the scheduled function fails, the primary record (Layer 1) is intact and retries

### Layer 3: convex-audit-log (Non-Transition Events)

- Admin data access, support interventions, API key usage
- Things that aren't state transitions but still need audit trails
- General-purpose, not transition-specific

### Layer 4: convex-tracer (Observability)

- Operational spans for performance and debugging
- Orthogonal to audit — not a compliance artifact

**Why not use the auditTrail component as the primary record?**

Component isolation is valuable for tamper evidence, but it breaks atomicity. If the component write fails after the entity patch succeeds, you have a transition without a receipt — a regulatory gap. The journal table in the main schema guarantees the same-mutation atomicity the spec requires.

**Why not use a trigger on auditJournal for the hash-chain copy?**

The Transition Engine is already the single code path for all transitions — there's no risk of "missing" a write. A direct `scheduler.runAfter` is simpler and keeps the critical-path mutation fast (no SHA-256 computation in the hot path). If future code paths write directly to auditJournal (compliance imports, admin corrections), a trigger could be added then.

---

## Implementation Plan

### Phase 1: Core Engine + Journal

1. Define the `auditJournal` table in the Convex schema
2. Build the Transition Engine generic mutation
3. Build the guard registry pattern
4. Build the effect registry pattern
5. Create the first machine definition (provisional application)
6. Wire end-to-end: command → engine → guard → patch + journal → effects

### Phase 2: Tamper Evidence Layer

7. Wire `scheduler.runAfter` to copy journal entries to the auditTrail component
8. Verify hash-chain integrity on read

### Phase 3: Additional Machines

9. Define machines for remaining entity types (full application, mortgage, servicing, etc.)
10. Register guards and effects for each

### Phase 4: Query & Compliance UI

11. Build audit journal query APIs (by entity, by actor, by outcome, date range)
12. Build compliance timeline view
13. Export/reporting for regulatory review

---

## Open Questions

1. **Machine version migration**: When a machine definition changes (new states, removed transitions), how do in-flight entities handled? Options: version-lock at creation, auto-migrate on next transition, or reject until manually migrated.
2. **Concurrent transitions**: If two commands arrive for the same entity simultaneously, Convex's OCC will retry the loser. Is that sufficient, or do we need explicit locking?
3. **Guard composition**: Should guards be composable (AND/OR logic), or is a flat list with implicit AND sufficient for now?
4. **Payload schema validation**: Should each event type declare its expected payload shape, or is `v.any()` with runtime validation in guards sufficient?
