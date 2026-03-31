# Chunk 03 Context: Bidirectional Queries + Verification

## Schema — recordLinks indexes (already in convex/schema.ts)
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
  .index("by_org_source", ["orgId", "sourceKind", "sourceId"])
  .index("by_org_target", ["orgId", "targetKind", "targetId"])
  // ...
```

## Schema — linkTypeDefs indexes
```typescript
linkTypeDefs: defineTable({
  // ...
})
  .index("by_source_object", ["sourceObjectDefId"])
  .index("by_target_object", ["targetObjectDefId"]),
```

## LinkedRecord Type (from convex/crm/types.ts)
```typescript
export interface LinkedRecord {
  labelValue?: string;
  linkId: string;
  linkTypeDefId: Id<"linkTypeDefs">;
  objectDefId: Id<"objectDefs">;
  recordId: string;
  recordKind: "record" | "native";
}
```

## Existing getRecord Link Resolution Pattern (from recordQueries.ts lines 631-696)
```typescript
// 5. Load outbound links (this record is source)
const outboundLinks = await ctx.db
  .query("recordLinks")
  .withIndex("by_org_source", (q) =>
    q.eq("orgId", orgId).eq("sourceKind", "record").eq("sourceId", record._id as string)
  )
  .filter((q) => q.eq(q.field("isDeleted"), false))
  .collect();

// 6. Load inbound links (this record is target)
const inboundLinks = await ctx.db
  .query("recordLinks")
  .withIndex("by_org_target", (q) =>
    q.eq("orgId", orgId).eq("targetKind", "record").eq("targetId", record._id as string)
  )
  .filter((q) => q.eq(q.field("isDeleted"), false))
  .collect();

// 7. Resolve link display info
const resolveLinks = async (
  links: Doc<"recordLinks">[],
  direction: "outbound" | "inbound"
): Promise<LinkedRecord[]> => {
  return Promise.all(
    links.map(async (link) => {
      const peerRecordId = direction === "outbound" ? link.targetId : link.sourceId;
      const peerKind = direction === "outbound" ? link.targetKind : link.sourceKind;
      const peerObjectDefId = direction === "outbound" ? link.targetObjectDefId : link.sourceObjectDefId;

      let labelValue: string | undefined;
      if (peerKind === "record") {
        const peerRecord = await ctx.db.get(peerRecordId as Id<"records">);
        labelValue = peerRecord?.labelValue ?? undefined;
      }

      return {
        linkId: link._id as string,
        linkTypeDefId: link.linkTypeDefId,
        recordId: peerRecordId,
        recordKind: peerKind,
        objectDefId: peerObjectDefId,
        labelValue,
      };
    })
  );
};
```

## Fluent Middleware
```typescript
// Data-plane queries — any authed user with org context
export const crmQuery = authedQuery.use(requireOrgContext);
```

## Contract Expected by ENG-258 (Linked Records Panel)
- `getLinkedRecords` returns `{ linkTypeName: string, linkTypeDefId, direction, links: LinkedRecord[] }[]`
  - Grouped by link type for panel section rendering
  - Each section is a link type with its links
- `getLinkTypesForObject` returns `Doc<"linkTypeDefs">[]`
  - Used by "Add Link" dialog to show available link types

## Key Differences from getRecord's Link Resolution
- `getRecord` returns flat `outbound: LinkedRecord[]` and `inbound: LinkedRecord[]`
- `getLinkedRecords` must GROUP by `linkTypeDefId` — ENG-258's panel renders sections per link type
- `getLinkedRecords` adds `linkTypeName` to each group
- `getLinkedRecords` supports both "record" and "native" kinds (getRecord only handles "record" currently)

## Key Rules
- NEVER use `any` type
- Use `crmQuery` for data-plane queries
- Always filter `isDeleted === false` when querying links (indexes don't include isDeleted)
- Prefer `by_org_source`/`by_org_target` over `by_source`/`by_target` (org-scoped)
- Run `bun check` BEFORE manually fixing lint
