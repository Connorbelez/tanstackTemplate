# Chunk 02 Context: Record Linking Mutations

## Schema — recordLinks (already in convex/schema.ts — DO NOT MODIFY)
```typescript
recordLinks: defineTable({
  orgId: v.string(),
  linkTypeDefId: v.id("linkTypeDefs"),
  sourceObjectDefId: v.id("objectDefs"),
  sourceKind: v.union(v.literal("record"), v.literal("native")),
  sourceId: v.string(),
  targetObjectDefId: v.id("objectDefs"),
  targetKind: v.union(v.literal("record"), v.literal("native")),
  targetId: v.string(),
  isDeleted: v.boolean(),
  createdAt: v.number(),
  createdBy: v.string(),
})
  .index("by_source", ["sourceKind", "sourceId"])
  .index("by_target", ["targetKind", "targetId"])
  .index("by_link_type", ["linkTypeDefId"])
  .index("by_org_source", ["orgId", "sourceKind", "sourceId"])
  .index("by_org_target", ["orgId", "targetKind", "targetId"])
  .index("by_org", ["orgId"]),
```

## Schema — linkTypeDefs
```typescript
linkTypeDefs: defineTable({
  orgId: v.string(),
  name: v.string(),
  sourceObjectDefId: v.id("objectDefs"),
  targetObjectDefId: v.id("objectDefs"),
  cardinality: cardinalityValidator, // one_to_one | one_to_many | many_to_many
  isActive: v.boolean(),
  createdAt: v.number(),
})
  .index("by_org", ["orgId"])
  .index("by_source_object", ["sourceObjectDefId"])
  .index("by_target_object", ["targetObjectDefId"]),
```

## Fluent Middleware
```typescript
// Data-plane mutations — any authed user with org context
export const crmMutation = authedMutation.use(requireOrgContext);
```

## Audit Log Pattern (from records.ts)
```typescript
// For creates (no diff):
await auditLog.log(ctx, {
  action: "crm.record.created",
  actorId: ctx.viewer.authId,
  resourceType: "records",
  resourceId: recordId,
  severity: "info",
  metadata: { objectDefId: args.objectDefId, objectName: objectDef.name, orgId },
});

// For deletes:
await auditLog.log(ctx, {
  action: "crm.record.deleted",
  actorId: ctx.viewer.authId,
  resourceType: "records",
  resourceId: args.recordId,
  severity: "warning",
  metadata: { objectDefId: record.objectDefId, orgId },
});
```

## Native Entity Existence Validation — Switch Pattern (from queryAdapter.ts)
Convex requires compile-time table names. Use a switch:
```typescript
// NativeTableName type from queryAdapter.ts:
type NativeTableName = "mortgages" | "borrowers" | "lenders" | "brokers" | "deals" | "obligations";

// Pattern for loading a single native entity by ID:
async function getNativeEntity(ctx, tableName: string, entityId: string) {
  switch (tableName) {
    case "mortgages":
      return ctx.db.get(entityId as Id<"mortgages">);
    case "borrowers":
      return ctx.db.get(entityId as Id<"borrowers">);
    case "lenders":
      return ctx.db.get(entityId as Id<"lenders">);
    case "brokers":
      return ctx.db.get(entityId as Id<"brokers">);
    case "deals":
      return ctx.db.get(entityId as Id<"deals">);
    case "obligations":
      return ctx.db.get(entityId as Id<"obligations">);
    default:
      throw new ConvexError(`Unknown native table: ${tableName}`);
  }
}
```

## Record Existence Check (for kind === "record")
```typescript
const record = await ctx.db.get(recordId as Id<"records">);
if (!record || record.isDeleted || record.orgId !== orgId) {
  throw new ConvexError("Source record not found or access denied");
}
```

## Validation Order (from Feature Spec — fail-fast, cheapest first)
1. Object type match — source/target match linkTypeDef's objectDefIds
2. Cross-org prohibition (REQ-166) — both endpoints in same org
3. Duplicate detection — no active link with same source+target+type
4. Cardinality enforcement — one_to_one/one_to_many checks

## Cardinality Rules
- `one_to_one`: Neither source NOR target may have an existing active link of this type (as either source or target)
  - Example: User ↔ Profile (each User has exactly one Profile, each Profile belongs to exactly one User)
- `one_to_many`: Source may appear in multiple links as SOURCE; Target may appear only once as TARGET.
  - Example: Customer → Order (one Customer can have many Orders, but each Order belongs to one Customer)
  - Validation: Check if target already has an active link of this type where it is the target
- `many_to_many`: No cardinality check needed
  - Example: Student ↔ Course

## Key Rules
- NEVER use `any` type
- Use `crmMutation` (not admin) for data-plane linking mutations
- Always validate org ownership on BOTH source and target (REQ-166 cross-org prohibition)
- Soft-delete only — `isDeleted: true` preserves audit trail
- Run `bun check` BEFORE manually fixing lint
- IDs stored as strings for polymorphic compatibility
- Native entities have `orgId` as a field on their table rows
