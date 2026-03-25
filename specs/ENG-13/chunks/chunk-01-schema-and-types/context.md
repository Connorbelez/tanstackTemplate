# Chunk Context: Schema and Types

Source: Linear ENG-13, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

### Schema Definition

```typescript
// Addition to convex/schema.ts
auditJournal: defineTable({
  entityType: v.string(),
  entityId: v.string(),
  eventType: v.string(),
  payload: v.optional(v.any()),
  previousState: v.string(),
  newState: v.string(),
  outcome: v.union(v.literal("transitioned"), v.literal("rejected")),
  reason: v.optional(v.string()),
  // Source fields flattened (Convex cannot index nested objects)
  actorId: v.string(),
  actorType: v.optional(v.string()),
  channel: v.string(),
  ip: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  machineVersion: v.optional(v.string()),
  effectsScheduled: v.optional(v.array(v.string())),
  timestamp: v.number(),
})
  .index("by_entity", ["entityType", "entityId", "timestamp"])
  .index("by_actor", ["actorId", "timestamp"])
  .index("by_type_and_time", ["entityType", "timestamp"])
```

### Updated AuditJournalEntry Type

```typescript
// convex/engine/types.ts — replaces existing AuditJournalEntry
// ── Audit Journal Entry ─────────────────────────────────────────────
// Mirrors the auditJournal table in schema.ts — source fields flattened for indexability
export interface AuditJournalEntry {
  entityType: EntityType;
  entityId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  previousState: string;
  newState: string;
  outcome: "transitioned" | "rejected";
  reason?: string;
  // Source fields flattened (Convex cannot index nested objects)
  actorId: string;
  actorType?: ActorType;
  channel: CommandChannel;
  ip?: string;
  sessionId?: string;
  machineVersion?: string;
  effectsScheduled?: string[];
  timestamp: number;
}
```

### Entity Table Map

```typescript
// ── Entity Type → Table Name Mapping ────────────────────────────────
export const ENTITY_TABLE_MAP = {
  onboardingRequest: "onboardingRequests",
  mortgage: "mortgages",
  obligation: "obligations",
} as const satisfies Record<EntityType, string>;
```

## Architecture Context

- The `auditJournal` table is a HOST-APP table (in `convex/schema.ts`), NOT a component table. It's written by `ctx.db.insert()` within the transition engine mutation for atomicity with the entity patch.
- Two audit systems coexist: `convex-audit-log` (third-party component) for general app audit events, and the new `auditJournal` table + `auditTrail` component for GT-specific transition records with cryptographic integrity.
- Source fields MUST be flattened (not nested in a `source` object) because Convex cannot index nested object fields.

## Types & Interfaces

Current `AuditJournalEntry` in `convex/engine/types.ts` (lines 42-56):
```typescript
// ── Audit Journal Entry ─────────────────────────────────────────────
// Mirrors the auditJournal table in schema.ts
export interface AuditJournalEntry {
  entityId: string;
  entityType: string;
  eventType: string;
  machineVersion?: string;
  newState: string;
  outcome: "transitioned" | "rejected";
  payload?: Record<string, unknown>;
  previousState: string;
  reason?: string;
  source: CommandSource;
  timestamp: number;
}
```

Related types already defined in `convex/engine/types.ts`:
```typescript
export type EntityType = "onboardingRequest" | "mortgage" | "obligation";
export type CommandChannel = "borrower_portal" | "broker_portal" | "admin_dashboard" | "api_webhook" | "scheduler";
export type ActorType = "borrower" | "broker" | "admin" | "system";
```

## Integration Points

- **ENG-12 (Transition Engine)** expects: `auditJournal` table for `ctx.db.insert("auditJournal", ...)` in Step 6b, and `ENTITY_TABLE_MAP` for entity loading by type.
- **ENG-21** expects: `AuditJournalEntry` type with flattened fields and `effectsScheduled`.

## Constraints & Rules

- `actorId` is required in the journal (not optional like in `CommandSource`). The transition engine must provide a default ("system") when no actor is specified — that's ENG-12's responsibility.
- No `any` types (per CLAUDE.md). Use `v.any()` only for `payload` field.
- Place the table after `onboardingRequests` with section comment `// ── GT Audit Journal ──────`.
- `entityType` in the interface should use `EntityType` (not generic `string`) for type safety.

## File Structure

- `convex/schema.ts` — add table definition
- `convex/engine/types.ts` — update AuditJournalEntry, add ENTITY_TABLE_MAP
