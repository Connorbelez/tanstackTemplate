# Chunk 2 Context: Middleware Integration & Mutation Logging

## Dependencies from Chunk 1
- `convex/auditLog.ts` — exports `auditLog` (AuditLog client instance)
- `convex/auth/auditAuth.ts` — exports `auditAuthFailure(ctx, viewer, details)` and `isMutationContext(ctx)`

## T-003 through T-007: Middleware audit logging in convex/fluent.ts

**File to modify:** `convex/fluent.ts`

Add `import { auditAuthFailure } from "./auth/auditAuth";` at the top of the file.

For each middleware failure path, add an `await auditAuthFailure(...)` call **before** the `throw new ConvexError(...)`. The `auditAuthFailure` function handles runtime context detection internally (no-ops in query context) and is try/catch wrapped (never prevents the throw).

### T-003: authMiddleware (line 70-71)
The `authMiddleware` failure happens when `identity` is null. At this point, there is no `viewer` on context yet.

**Current code:**
```typescript
const identity = await context.auth.getUserIdentity();
if (!identity) {
  throw new ConvexError("Unauthorized: sign in required");
}
```

**Change to:**
```typescript
const identity = await context.auth.getUserIdentity();
if (!identity) {
  await auditAuthFailure(context, undefined, {
    middleware: "authMiddleware",
    reason: "No identity found — unauthenticated access attempt",
  });
  throw new ConvexError("Unauthorized: sign in required");
}
```

### T-004: requireFairLendAdmin (line 114-115)
The viewer IS available on context here.

**Current code:**
```typescript
if (!isFairLendAdmin) {
  throw new ConvexError("Forbidden: fair lend admin role required");
}
```

**Change to:**
```typescript
if (!isFairLendAdmin) {
  await auditAuthFailure(context, context.viewer, {
    middleware: "requireFairLendAdmin",
    reason: "User is not a FairLend Staff admin",
  });
  throw new ConvexError("Forbidden: fair lend admin role required");
}
```

### T-005: requireOrgContext (line 145-146)
**Current code:**
```typescript
if (!(org_id || hasUnderwriterRole(context.viewer).hasRole)) {
  throw new ConvexError("Forbidden: org context required");
}
```

**Change to:**
```typescript
if (!(org_id || hasUnderwriterRole(context.viewer).hasRole)) {
  await auditAuthFailure(context, context.viewer, {
    middleware: "requireOrgContext",
    reason: "Missing org context and not an underwriter",
  });
  throw new ConvexError("Forbidden: org context required");
}
```

### T-006: requireAdmin (line 162-163)
**Current code:**
```typescript
if (!isAdmin) {
  throw new ConvexError("Forbidden: admin role required");
}
```

**Change to:**
```typescript
if (!isAdmin) {
  await auditAuthFailure(context, context.viewer, {
    middleware: "requireAdmin",
    reason: "User does not have admin role",
  });
  throw new ConvexError("Forbidden: admin role required");
}
```

### T-007: requirePermission (line 177-178)
**Current code:**
```typescript
if (!context.viewer.permissions.has(permission)) {
  throw new ConvexError(`Forbidden: permission "${permission}" required`);
}
```

**Change to:**
```typescript
if (!context.viewer.permissions.has(permission)) {
  await auditAuthFailure(context, context.viewer, {
    middleware: "requirePermission",
    required: permission,
    reason: `Missing permission: ${permission}`,
  });
  throw new ConvexError(`Forbidden: permission "${permission}" required`);
}
```

## T-008 through T-010: Onboarding mutation audit logging

**File to modify:** `convex/onboarding/mutations.ts`

Add `import { auditLog } from "../auditLog";` at the top.

These mutations already run in mutation context, so `auditLog.log()` works directly — no `isMutationContext` detection needed.

### T-008: requestRole — after the auditJournal insert (after line 138, before `return requestId`)
```typescript
await auditLog.log(ctx, {
  action: "onboarding.role_requested",
  actorId: ctx.viewer.authId,
  resourceType: "onboardingRequests",
  resourceId: requestId,
  severity: "info",
  metadata: {
    requestedRole,
    referralSource: args.referralSource,
    targetOrganizationId,
    invitedByBrokerId: args.invitedByBrokerId,
  },
});
```

### T-009: approveRequest — after `if (!result.success)` check passes (before `return result`)
```typescript
await auditLog.log(ctx, {
  action: "onboarding.request_approved",
  actorId: ctx.viewer.authId,
  resourceType: "onboardingRequests",
  resourceId: args.requestId,
  severity: "info",
  metadata: {
    previousState: result.previousState,
    newState: result.newState,
  },
});
```

### T-010: rejectRequest — after `if (!result.success)` check passes (before `return result`)
```typescript
await auditLog.log(ctx, {
  action: "onboarding.request_rejected",
  actorId: ctx.viewer.authId,
  resourceType: "onboardingRequests",
  resourceId: args.requestId,
  severity: "info",
  metadata: {
    rejectionReason: args.rejectionReason,
    previousState: result.previousState,
    newState: result.newState,
  },
});
```

## T-011: Role assignment effect audit logging

**File to modify:** `convex/engine/effects/onboarding.ts`

Add `import { auditLog } from "../../auditLog";` at the top.

This runs in **action context** which supports `ctx.runMutation()`, so `auditLog.log()` works.

### On success — after the WorkOS `createOrganizationMembership` call succeeds and before the `ctx.runMutation(transitionMutation)` call:
```typescript
await auditLog.log(ctx, {
  action: "onboarding.role_assigned",
  actorId: "system",
  resourceType: "onboardingRequests",
  resourceId: args.entityId,
  severity: "info",
  metadata: {
    userId: user.authId,
    requestedRole: request.requestedRole,
    targetOrganizationId: targetOrgId,
    brokerOrgProvisioned: request.requestedRole === "broker",
  },
});
```

### On failure — in the catch block, BEFORE `throw error`:
```typescript
try {
  await auditLog.log(ctx, {
    action: "onboarding.role_assignment_failed",
    actorId: "system",
    resourceType: "onboardingRequests",
    resourceId: args.entityId,
    severity: "error",
    metadata: {
      userId: user?.authId,
      requestedRole: request?.requestedRole,
      error: error instanceof Error ? error.message : String(error),
    },
  });
} catch {
  // Best-effort audit logging — don't mask the original error
}
```

Note: The failure audit log is itself wrapped in try/catch because if the WorkOS API failed, we don't want an audit log failure to mask the original error.

## Action Name Convention

All action names follow stable dot-namespaced pattern:

```
auth.authMiddleware_denied          — unauthenticated access
auth.requireFairLendAdmin_denied    — not FairLend admin
auth.requireOrgContext_denied       — missing org context
auth.requireAdmin_denied            — not admin role
auth.requirePermission_denied       — missing specific permission
onboarding.role_requested           — user requested a role
onboarding.request_approved         — admin approved
onboarding.request_rejected         — admin rejected
onboarding.role_assigned            — WorkOS assignment succeeded
onboarding.role_assignment_failed   — WorkOS assignment failed
```

## Severity Convention

- `info` — normal successful operations (role requested, approved, rejected, assigned)
- `warning` — authorization denials (all middleware failures)
- `error` — system failures (WorkOS API failure)
