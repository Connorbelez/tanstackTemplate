# Chunk 01 Context: Link Type CRUD

## Schema (already in convex/schema.ts — DO NOT MODIFY)
```typescript
linkTypeDefs: defineTable({
  orgId: v.string(),
  name: v.string(),
  sourceObjectDefId: v.id("objectDefs"),
  targetObjectDefId: v.id("objectDefs"),
  cardinality: cardinalityValidator,
  isActive: v.boolean(),
  createdAt: v.number(),
})
  .index("by_org", ["orgId"])
  .index("by_source_object", ["sourceObjectDefId"])
  .index("by_target_object", ["targetObjectDefId"]),
```

## Validators (convex/crm/validators.ts)
```typescript
export const cardinalityValidator = v.union(
  v.literal("one_to_one"),
  v.literal("one_to_many"),
  v.literal("many_to_many")
);
```

## Fluent Middleware Chains (convex/fluent.ts)
```typescript
// Admin mutations — requires auth + org context + admin role
export const crmAdminMutation = authedMutation
  .use(requireOrgContext)
  .use(requireAdmin);

export const crmAdminQuery = authedQuery
  .use(requireOrgContext)
  .use(requireAdmin);
```

## Audit Log Pattern (from objectDefs.ts)
```typescript
import { auditLog } from "../auditLog";

// For creates/deletes (no diff):
await auditLog.log(ctx, {
  action: "crm.object.created",
  actorId: ctx.viewer.authId,
  resourceType: "objectDefs",
  resourceId: objectDefId,
  severity: "info",
  metadata: { name: args.name, orgId },
});
```

## Reference Pattern: objectDefs.ts createObject
```typescript
export const createObject = crmAdminMutation
  .input({
    name: v.string(),
    singularLabel: v.string(),
    // ...
  })
  .handler(async (ctx, args) => {
    const orgId = ctx.viewer.orgId;
    if (!orgId) {
      throw new ConvexError("Org context required for CRM operations");
    }
    // validate, insert, audit
    return objectDefId;
  })
  .public();
```

## Reference Pattern: objectDefs.ts deactivateObject
```typescript
export const deactivateObject = crmAdminMutation
  .input({ objectDefId: v.id("objectDefs") })
  .handler(async (ctx, args) => {
    const orgId = ctx.viewer.orgId;
    if (!orgId) {
      throw new ConvexError("Org context required for CRM operations");
    }
    const objectDef = await ctx.db.get(args.objectDefId);
    if (!objectDef || objectDef.orgId !== orgId) {
      throw new ConvexError("Object not found or access denied");
    }
    await ctx.db.patch(args.objectDefId, { isActive: false, updatedAt: Date.now() });
    // Audit
    await auditLog.log(ctx, { ... });
  })
  .public();
```

## recordLinks schema (for deactivateLinkType active-links check)
```typescript
recordLinks: defineTable({
  // ...
  linkTypeDefId: v.id("linkTypeDefs"),
  isDeleted: v.boolean(),
  // ...
})
  .index("by_link_type", ["linkTypeDefId"])
```

## Key Rules
- NEVER use `any` as a type
- Use `crmAdminMutation` for control-plane mutations (admin-only)
- Always validate org ownership: `entity.orgId !== orgId`
- Run `bun check` BEFORE manually fixing lint
- Cardinality convention: for one_to_many, source = "one" side, target = "many" side. Document this in the createLinkType handler.
