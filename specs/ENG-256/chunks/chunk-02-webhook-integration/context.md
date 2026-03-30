# Chunk 02 Context: Webhook Integration + Quality Gate

## Goal
Wire the WorkOS `organization.created` webhook to auto-trigger system object bootstrapping for new orgs.

## File to Modify
- `convex/auth.ts` — Add bootstrap trigger to the `organization.created` event handler

## Current organization.created handler (convex/auth.ts lines 245-247)
```typescript
"organization.created": async (ctx, event) => {
  await upsertOrganization(ctx, event.data);
},
```

## Required Change
After the `upsertOrganization` call, schedule the bootstrap function:
```typescript
"organization.created": async (ctx, event) => {
  await upsertOrganization(ctx, event.data);
  // Auto-bootstrap system objects for the new org (UC-96)
  await ctx.scheduler.runAfter(
    0,
    internal.crm.systemAdapters.bootstrap.bootstrapSystemObjects,
    { orgId: event.data.id }
  );
},
```

## Key Details
- `event.data.id` is the WorkOS organization ID string (e.g., `"org_01KKF56VABM4NYFFSR039RTJBM"`)
- `runAfter(0, ...)` ensures bootstrap runs asynchronously in a separate transaction — avoids transaction size limits
- The `internal` import is already present at the top of auth.ts: `import { components, internal } from "./_generated/api";`
- The bootstrap function is idempotent — safe for webhook retries

## Quality Gate
Run these commands and fix any issues:
1. `bunx convex codegen` — regenerate API types (needed because new internalMutation in bootstrap.ts)
2. `bun check` — lint + format (runs biome auto-fix first)
3. `bun typecheck` — TypeScript type checking
