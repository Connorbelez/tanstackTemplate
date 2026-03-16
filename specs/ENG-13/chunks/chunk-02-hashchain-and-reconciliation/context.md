# Chunk Context: Hash-Chain Function and Reconciliation

Source: Linear ENG-13, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

### Hash-Chain Function

```typescript
// convex/engine/hashChain.ts
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { AuditTrail } from "../auditTrailClient";
import { components } from "../_generated/api";

const auditTrail = new AuditTrail(components.auditTrail);

export const hashChainJournalEntry = internalMutation({
  args: {
    journalEntryId: v.id("auditJournal"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.journalEntryId);
    if (!entry) {
      console.warn(
        `[GT HashChain] Journal entry not found: ${args.journalEntryId}`
      );
      return;
    }

    try {
      await auditTrail.insert(ctx, {
        entityId: entry.entityId,
        entityType: entry.entityType,
        eventType: entry.eventType,
        actorId: entry.actorId,
        beforeState: entry.previousState,
        afterState: entry.newState,
        metadata: JSON.stringify({
          outcome: entry.outcome,
          machineVersion: entry.machineVersion,
          effectsScheduled: entry.effectsScheduled,
          channel: entry.channel,
          reason: entry.reason,
        }),
        timestamp: entry.timestamp,
      });
    } catch (error) {
      // Fire-and-forget: Layer 2 failure must not affect Layer 1
      console.error(
        `[GT HashChain] Failed to chain entry ${args.journalEntryId}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  },
});
```

### Reconciliation Function

```typescript
// convex/engine/reconciliation.ts
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

interface Discrepancy {
  entityType: string;
  entityId: string;
  entityStatus: string;
  journalNewState: string;
  journalEntryId: string;
}

// Import from types.ts
import { ENTITY_TABLE_MAP } from "./types";

export const reconcile = query({
  args: {},
  handler: async (ctx) => {
    const discrepancies: Discrepancy[] = [];
    const entityTypes = Object.keys(ENTITY_TABLE_MAP) as Array<
      keyof typeof ENTITY_TABLE_MAP
    >;

    for (const entityType of entityTypes) {
      const journalEntries = await ctx.db
        .query("auditJournal")
        .withIndex("by_type_and_time", (q) => q.eq("entityType", entityType))
        .order("desc")
        .collect();

      // Skip entity types with no journal entries (handles missing tables)
      if (journalEntries.length === 0) continue;

      // Group by entityId, take latest "transitioned" entry per entity
      const latestByEntity = new Map<
        string,
        { newState: string; _id: string }
      >();
      for (const entry of journalEntries) {
        if (
          entry.outcome === "transitioned" &&
          !latestByEntity.has(entry.entityId)
        ) {
          latestByEntity.set(entry.entityId, {
            newState: entry.newState,
            _id: entry._id,
          });
        }
      }

      const tableName = ENTITY_TABLE_MAP[entityType];
      for (const [entityId, journal] of latestByEntity) {
        const entity = await ctx.db.get(
          entityId as Id<typeof tableName>
        );
        if (!entity) {
          discrepancies.push({
            entityType,
            entityId,
            entityStatus: "ENTITY_NOT_FOUND",
            journalNewState: journal.newState,
            journalEntryId: journal._id,
          });
          continue;
        }

        const entityStatus = (entity as { status: string }).status;
        if (entityStatus !== journal.newState) {
          discrepancies.push({
            entityType,
            entityId,
            entityStatus,
            journalNewState: journal.newState,
            journalEntryId: journal._id,
          });
        }
      }
    }

    return {
      checkedAt: Date.now(),
      discrepancies,
      isHealthy: discrepancies.length === 0,
    };
  },
});
```

## Architecture Context

- **Layer 1** = host-app `auditJournal` table — written atomically in the same mutation as the entity patch. Queryable, indexable, source of truth for auditors.
- **Layer 2** = `auditTrail` component — fire-and-forget copy with SHA-256 hash-chaining. Component isolation means host code cannot modify after insertion.
- `hashChainJournalEntry` is an `internalMutation` (not `internalAction`) because it needs `ctx.db.get()` to read the journal entry and `ctx.runMutation()` to call the component.
- Scheduled via `ctx.scheduler.runAfter(0, ...)` — runs immediately after the transition mutation commits.
- Fire-and-forget: if hash-chain fails, entry exists in Layer 1 but not Layer 2. Acceptable per spec.

## Types & Interfaces

### AuditTrail client (`convex/auditTrailClient.ts`) insert signature:
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

### Component `insert()` internals (`convex/components/auditTrail/lib.ts`):
- Accepts: entityId, entityType, eventType, actorId, beforeState (optional string), afterState (optional string), metadata (optional string), timestamp
- Sanitizes PII from state/metadata strings
- Chains via prevHash: queries latest event for entityId, gets its hash
- Computes SHA-256 hash of: `{ p: prevHash, t: eventType, e: entityId, a: actorId, ts: timestamp, s: afterState }`
- Atomically inserts event + outbox entry

### Field mapping from journal → auditTrail component:
- `entry.previousState` → `beforeState` (string)
- `entry.newState` → `afterState` (string)
- Extra fields → `metadata` as JSON string: `{ outcome, machineVersion, effectsScheduled, channel, reason }`

### ENTITY_TABLE_MAP (from types.ts, created in chunk 01):
```typescript
export const ENTITY_TABLE_MAP = {
  onboardingRequest: "onboardingRequests",
  mortgage: "mortgages",
  obligation: "obligations",
} as const satisfies Record<EntityType, string>;
```

## Integration Points

- **ENG-12** calls `ctx.scheduler.runAfter(0, internal.engine.hashChain.hashChainJournalEntry, { journalEntryId })` in Step 8.
- **ENG-21/ENG-23** call `reconcile` query for post-test verification and reconciliation checks.
- `mortgages` and `obligations` tables don't exist yet (ENG-18 creates them). The reconciliation function must handle this — skip entity types with no journal entries.

## Constraints & Rules

- `hashChainJournalEntry` MUST be `internalMutation` not `internalAction`.
- Fire-and-forget: try/catch around auditTrail.insert(), log errors, never throw.
- Reconciliation is a `query` (read-only, no mutations).
- No `any` types (per CLAUDE.md).
- Run `bun check` before manually fixing lint/formatting errors.

## File Structure

- `convex/engine/hashChain.ts` — new file
- `convex/engine/reconciliation.ts` — new file
