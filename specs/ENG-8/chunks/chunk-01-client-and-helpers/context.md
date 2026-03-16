# Chunk 1 Context: Audit Client & Helpers

## T-001: Create shared production audit log client

**File to create:** `convex/auditLog.ts`

**Promoted from demo:** `convex/demo/auditLog.ts` line 6 uses `new AuditLog(components.auditLog)` without PII config. The production version adds PII redaction.

**Implementation:**
```typescript
import { AuditLog } from "convex-audit-log";
import { components } from "./_generated/api";

export const auditLog = new AuditLog(components.auditLog, {
  piiFields: ["email", "phone", "ssn", "password", "phoneNumber",
              "borrowerEmail", "borrowerPhone", "borrowerSsn"],
});
```

**Notes:**
- `convex-audit-log` is already installed in `package.json` and registered in `convex/convex.config.ts` (line 44: `app.use(auditLog)`)
- The client is stateless — module-scope instantiation is safe
- Do NOT modify the demo file. This is a new production file.

## T-002: Create auditAuthFailure helper

**File to create:** `convex/auth/auditAuth.ts`

Create a directory `convex/auth/` if it doesn't exist.

**Critical constraint:** `convex-audit-log`'s `log()` method calls `ctx.runMutation()` internally. This means it can ONLY be called from **mutation** or **action** context — NOT query context. Since middleware runs in both query and mutation chains, we need runtime detection.

**Implementation:**
```typescript
import type { GenericMutationCtx, GenericDataModel } from "convex/server";
import { auditLog } from "../auditLog";
import type { Viewer } from "../fluent";

/**
 * Runtime check: does this context support runMutation()?
 * Mutation and action contexts do; query contexts don't.
 */
export function isMutationContext(
  ctx: unknown
): ctx is GenericMutationCtx<GenericDataModel> {
  return typeof ctx === "object" && ctx !== null && "runMutation" in ctx;
}

/**
 * Log an auth failure to the audit log. Best-effort — wrapped in try/catch
 * so audit failures never prevent the auth denial from throwing.
 * Only logs in mutation/action context (queries can't write).
 */
export async function auditAuthFailure(
  ctx: unknown,
  viewer: Partial<Viewer> | undefined,
  details: {
    middleware: string;
    required?: string;
    reason: string;
  },
): Promise<void> {
  if (!isMutationContext(ctx)) return;

  try {
    await auditLog.log(ctx, {
      action: `auth.${details.middleware}_denied`,
      actorId: viewer?.authId ?? "anonymous",
      resourceType: "auth_check",
      resourceId: details.middleware,
      severity: "warning",
      metadata: {
        middleware: details.middleware,
        required: details.required,
        reason: details.reason,
        userRoles: viewer?.roles ? [...viewer.roles] : [],
        userPermissions: viewer?.permissions ? [...viewer.permissions] : [],
        orgId: viewer?.orgId,
      },
    });
  } catch (e) {
    console.error("[auditAuthFailure] Failed to write audit log:", e);
  }
}
```

**Design notes:**
- The `isMutationContext` check is the runtime detection approach. It checks for `runMutation` on the context object.
- The entire audit call is wrapped in try/catch. Auth denial is the primary concern; audit is best-effort.
- When `authMiddleware` fails (no identity), `viewer` is undefined, so actorId falls back to `"anonymous"`.
- The `ctx` parameter is typed as `unknown` so the function works with both query and mutation context without TypeScript errors in the middleware.

## Viewer interface (from convex/fluent.ts)

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

## convex-audit-log API (from docs)

```typescript
// Log a simple event
await auditLog.log(ctx, {
  action: "auth.permission_denied",  // stable dot-namespaced name
  actorId: "user_01KK...",           // WorkOS subject ID or "anonymous"
  resourceType: "auth_check",        // what category of resource
  resourceId: "requirePermission",   // specific identifier
  severity: "warning",               // info | warning | error | critical
  metadata: { ... },                 // arbitrary structured data (PII auto-redacted)
});
```
