# Chunk Context: Commands & Integration

Source: Linear ENG-12, Notion implementation plan + linked pages.
This file and the accompanying tasks.md contain everything needed to implement this chunk.

## Implementation Plan Excerpt

### Step 4: Create `buildSource` helper
**File:** `convex/engine/commands.ts` (Create)
```typescript
import type { Viewer } from "../fluent";
import type { CommandSource } from "./types";

/** Build CommandSource from the authenticated viewer context. */
export function buildSource(
  viewer: Viewer,
  channel: CommandSource["channel"]
): CommandSource {
  return {
    actorId: viewer.authId,
    actorType: viewer.isFairLendAdmin ? "admin" : undefined,
    channel,
    // ip and sessionId can be added later from request headers
  };
}
```

### Step 5: Create typed command wrappers
**File:** `convex/engine/commands.ts` (same file as Step 4)
Three wrappers with different auth levels:

**transitionOnboardingRequest** — Admin-gated:
```typescript
export const transitionOnboardingRequest = adminMutation
  .input(commandArgsValidator)
  .handler(async (ctx, args) => {
    return executeTransition(ctx, {
      ...args,
      entityType: "onboardingRequest",
      source: args.source ?? buildSource(ctx.viewer, "admin_dashboard"),
    });
  })
  .public();
```

**transitionMortgage** — Authed + permission:
```typescript
export const transitionMortgage = authedMutation
  .use(requirePermission("mortgage:transition"))
  .input(commandArgsValidator)
  .handler(async (ctx, args) => {
    return executeTransition(ctx, {
      ...args,
      entityType: "mortgage",
      source: args.source ?? buildSource(ctx.viewer, ctx.viewer.orgId ? "broker_portal" : "admin_dashboard"),
    });
  })
  .public();
```

**transitionObligation** — Internal only:
```typescript
export const transitionObligation = internalMutation({
  args: commandArgsValidator,
  handler: async (ctx, args) => {
    return executeTransition(ctx, {
      ...args,
      entityType: "obligation",
      source: args.source ?? { channel: "scheduler", actorType: "system" },
    });
  },
});
```

### Step 7: Update callers to use new API
**File:** `convex/onboarding/mutations.ts` (Modify)
Replace `transitionEntity(ctx, "onboardingRequest", ...)` calls with `executeTransition(ctx, { entityType: "onboardingRequest", ... })`.
The `approveRequest` and `rejectRequest` mutations should use `buildSource(ctx.viewer, "admin_dashboard")` instead of manually constructing source objects.

## Architecture Context

### Typed Command Wrappers Design Decision:
Each entity type has different auth requirements. Typed wrappers encode these at the function level, preventing callers from bypassing RBAC. The generic `executeTransition()` helper remains internal-only.

- `transitionOnboardingRequest` — Admin-gated because only admins approve/reject onboarding requests
- `transitionMortgage` — Authed + `mortgage:transition` permission because brokers and admins can transition mortgages
- `transitionObligation` — Internal-only because obligations are transitioned by scheduled functions and cross-entity effects, never by direct user action

### CommandSource — Source is metadata, not control flow:
The machine receives the same event type regardless of whether it came from a broker clicking a button or a webhook callback. The source is written to the journal for auditability.

## Existing Code State

### `convex/fluent.ts` — AUTH PATTERNS:
```typescript
export interface Viewer {
  authId: string;
  email: string | undefined;
  firstName: string | undefined;
  isFairLendAdmin: boolean;
  lastName: string | undefined;
  orgId: string | undefined;
  orgName: string | undefined;
  permissions: Set<string>;
  role: string | undefined;
  roles: Set<string>;
}
```

Auth middleware exports:
- `convex` — builder instance
- `authMiddleware` — extracts JWT identity, builds Viewer
- `adminMutation` — requires `isFairLendAdmin`
- `authedMutation` — requires any authenticated user
- `requirePermission(perm)` — middleware that checks `viewer.permissions.has(perm)`

### `convex/engine/validators.ts` — ALREADY HAS:
```typescript
export const commandArgsValidator = {
  entityType: entityTypeValidator,
  entityId: v.string(),
  eventType: v.string(),
  payload: v.optional(v.any()),
  source: sourceValidator,
};
```

IMPORTANT: `commandArgsValidator` includes `source` as REQUIRED (not optional). The typed command wrappers receive `source` from args validation. The `buildSource` helper is used as a fallback when source is not provided, but since the validator requires it, the wrappers need to handle this.

Actually, looking more carefully at the validator: `sourceValidator` is a `v.object(...)` which is required by default. The typed wrappers should define their OWN args validators that make source optional, OR use the existing `commandArgsValidator` and provide defaults.

The plan's code uses `args.source ?? buildSource(...)` which implies source can be undefined. For this to work, the wrappers should define args with `source: v.optional(sourceValidator)`.

### Current `convex/onboarding/mutations.ts` — WHAT TO CHANGE:
```typescript
// Current (approveRequest):
const result = await transitionEntity(
  ctx,
  "onboardingRequest",
  args.requestId,
  "APPROVE",
  {},
  {
    channel: "admin_dashboard",
    actorId: ctx.viewer.authId,
    actorType: "admin",
  }
);

// New:
const result = await executeTransition(ctx, {
  entityType: "onboardingRequest",
  entityId: args.requestId,
  eventType: "APPROVE",
  payload: {},
  source: buildSource(ctx.viewer, "admin_dashboard"),
});
```

Same pattern for `rejectRequest`:
```typescript
// Current:
const result = await transitionEntity(
  ctx,
  "onboardingRequest",
  args.requestId,
  "REJECT",
  { reason: args.rejectionReason },
  {
    channel: "admin_dashboard",
    actorId: ctx.viewer.authId,
    actorType: "admin",
  }
);

// New:
const result = await executeTransition(ctx, {
  entityType: "onboardingRequest",
  entityId: args.requestId,
  eventType: "REJECT",
  payload: { reason: args.rejectionReason },
  source: buildSource(ctx.viewer, "admin_dashboard"),
});
```

Import changes for `onboarding/mutations.ts`:
- Remove: `import { transitionEntity } from "../engine/transition";`
- Add: `import { executeTransition } from "../engine/transition";`
- Add: `import { buildSource } from "../engine/commands";`

## Constraints & Rules
- `bun check`, `bun typecheck`, and `bunx convex codegen` must pass
- NEVER use `any` as a type unless absolutely necessary
- Run `bun check` first before manually fixing lint/format errors
- Long-term maintainability: extract shared logic, avoid duplication
- The `approveRequest` and `rejectRequest` mutations keep their ADDITIONAL logic (patching `reviewedBy`, `reviewedAt`, `rejectionReason`) — only the transition engine call changes

## File Structure
- `convex/engine/commands.ts` — CREATE
- `convex/onboarding/mutations.ts` — MODIFY (update imports + transition calls)
