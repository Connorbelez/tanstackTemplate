# Chunk 01 Context: Backend — Activity Timeline Query

## Goal
Create a Convex query that returns paginated activity events for a given record (EAV or native). Events come from the `convex-audit-log` component. Each event is enriched with actor display info (name, avatar) from the `users` table.

## T-001: Activity Event Types

Add to `convex/crm/types.ts`:

```ts
/** A single activity event for the timeline display. */
export interface ActivityEvent {
  _id: string;
  /** Event category for icon/color selection */
  eventType: "created" | "field_updated" | "linked" | "unlinked" | "status_changed" | "other";
  /** The raw audit action string (e.g. "crm.record.created", "crm.link.created") */
  action: string;
  /** Human-readable description */
  description: string;
  /** Actor info */
  actor: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  /** Unix timestamp ms */
  timestamp: number;
  /** Optional before/after diff for field changes */
  diff?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  /** Optional metadata from the audit event */
  metadata?: Record<string, unknown>;
}

/** Result shape for paginated activity queries. */
export interface ActivityQueryResult {
  events: ActivityEvent[];
  continueCursor: string | null;
  isDone: boolean;
}
```

## T-002: getRecordActivity Query

Create `convex/crm/activityQueries.ts`.

### Middleware Chain
Use `crmQuery` (authed + org context). The chain is defined in `convex/fluent.ts`:
```ts
export const crmQuery = authedQuery.use(requireOrgContext);
```

### Audit Log Client
The audit log is initialized in `convex/auditLog.ts`:
```ts
import { AuditLog } from "convex-audit-log";
import { components } from "./_generated/api";

export const auditLog = new AuditLog(components.auditLog, {
  piiFields: ["email", "phone", "ssn", "password", "phoneNumber", "borrowerEmail", "borrowerPhone", "borrowerSsn"],
});
```

### Query API for audit events
Use `auditLog.queryByResource(ctx, { resourceType, resourceId, limit })` to fetch events.
- `resourceType` should be either the table name (e.g., "records") or the objectDef name
- `resourceId` is the record's _id as a string

### How existing CRM code logs audit events
All CRM mutations log audit events like this (from `convex/crm/records.ts`):
```ts
await auditLog.log(ctx, {
  action: "crm.record.created",
  actorId: ctx.viewer.authId,
  resourceType: "records",
  resourceId: recordId,
  severity: "info",
  metadata: { objectDefId, orgId, ... },
});
```

Link events (from `convex/crm/recordLinks.ts`):
```ts
await auditLog.log(ctx, {
  action: "crm.link.created",
  actorId: ctx.viewer.authId,
  resourceType: "recordLinks",
  resourceId: linkId,
  severity: "info",
  metadata: { linkTypeDefId, sourceKind, sourceId, targetKind, targetId, orgId },
});
```

### Actor Enrichment
Look up actor info from the `users` table using the `authId` field:
```ts
const user = await ctx.db
  .query("users")
  .withIndex("authId", (q) => q.eq("authId", actorId))
  .first();
```
Users table schema:
- `authId: v.string()` — indexed as "authId"
- `email: v.string()`
- `firstName: v.string()`
- `lastName: v.string()`

### Action-to-EventType Mapping
Map audit action strings to display event types:
- `crm.record.created` → `"created"`
- `crm.record.updated` → `"field_updated"`
- `crm.link.created` → `"linked"`
- `crm.link.deleted` → `"unlinked"`
- Any action containing `status` → `"status_changed"`
- Everything else → `"other"`

### Query Shape
```ts
export const getRecordActivity = crmQuery
  .input({
    recordId: v.string(),
    recordKind: entityKindValidator, // "record" | "native"
    limit: v.optional(v.number()),   // default 20, max 50
    cursor: v.optional(v.string()),  // for pagination
  })
  .handler(async (ctx, args) => { ... })
  .public();
```

The query should:
1. Validate org context
2. Query audit events by resourceId (the record's _id)
3. Also query audit events where the record appears in metadata (for link events where this record is source or target)
4. Merge, deduplicate, sort by timestamp descending
5. Enrich each event with actor info (batch user lookups)
6. Map to ActivityEvent shape
7. Return paginated result

### Important Notes
- The `convex-audit-log` queryByResource returns events in ascending order by default — reverse for timeline display (newest first)
- For link events, the resourceId is the link ID, not the record ID. To find link events for a record, query where `metadata.sourceId === recordId` or `metadata.targetId === recordId`. If queryByResource doesn't support metadata filtering, just query by the record's resourceId and accept that link events may need a separate query path.
- Cache user lookups within the query to avoid repeated DB reads for the same actor

### Pagination Notes
The activity timeline uses cursor-based pagination via `continueCursor`/`isDone`. However, the algorithm merges two event sources:
1. Direct resource hits (audit events where the record is the resource)
2. Metadata-based link hits (audit events where the record appears in `sourceId` or `targetId`)

Because these are two separate queries with separate cursors, reproducing a given page requires tracking both cursors plus dedupe state. This means pagination for merged link events is not perfectly reproducible across page boundaries — subsequent pages may show slight variations in the merged, deduped set.

Additionally, `linked`/`unlinked` events sourced from metadata queries are best-effort: they depend on the metadata being present and queryable, so some link lifecycle events may not appear in the timeline if the metadata is unavailable.

## T-003: Quality Gate
Run: `bun check && bun typecheck && bunx convex codegen`
Fix any issues before marking complete.
