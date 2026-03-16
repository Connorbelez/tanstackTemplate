# Chunk 3 Context: Admin Queries & Verification

## Dependencies from earlier chunks
- `convex/auditLog.ts` — exports `auditLog` client
- Fluent chains from `convex/fluent.ts` — `adminQuery`, `requirePermission`

## T-012: Create admin audit query functions

**File to create:** `convex/audit/queries.ts`

Create directory `convex/audit/` if it doesn't exist.

**Promoted from:** `convex/demo/auditLog.ts` lines 85-100 (queryByResource, queryByActor) and `convex/demo/auditTraceability.ts` (watchCritical). The demo versions have no auth guards — production versions add `platform:view_audit` permission via fluent chains.

**Implementation:**
```typescript
import { v } from "convex/values";
import { adminQuery, requirePermission } from "../fluent";
import { auditLog } from "../auditLog";

/** Query auth-related audit events for a specific user. */
export const getAuthEventsByActor = adminQuery
  .use(requirePermission("platform:view_audit"))
  .input({ actorId: v.string(), limit: v.optional(v.number()) })
  .handler(async (ctx, args) => {
    return auditLog.queryByActor(ctx, {
      actorId: args.actorId,
      limit: args.limit ?? 50,
    });
  })
  .public();

/** Query audit events for a specific onboarding request. */
export const getAuditTrailForRequest = adminQuery
  .use(requirePermission("platform:view_audit"))
  .input({ requestId: v.string() })
  .handler(async (ctx, args) => {
    return auditLog.queryByResource(ctx, {
      resourceType: "onboardingRequests",
      resourceId: args.requestId,
      limit: 50,
    });
  })
  .public();

/** Watch critical auth events in realtime (security dashboard). */
export const watchCriticalAuthEvents = adminQuery
  .use(requirePermission("platform:view_audit"))
  .handler(async (ctx) => {
    return auditLog.watchCritical(ctx, {
      severity: ["warning", "error", "critical"],
      limit: 20,
    });
  })
  .public();
```

**Notes:**
- All queries require `platform:view_audit` permission (admin only)
- Uses fluent `adminQuery` chain which includes `authMiddleware` + `requireFairLendAdmin`
- The `queryByActor`, `queryByResource`, and `watchCritical` methods are read-only (query context) and are part of the convex-audit-log component API

## T-013: Quality gates

Run these commands in sequence:
1. `bun check` — fixes formatting, reports lint errors
2. `bun typecheck` — TypeScript compilation check
3. `bunx convex codegen` — regenerate Convex types

All must pass with zero errors (warnings from pre-existing code are acceptable).

## T-014: Test verification

Run `bun run test` to ensure all existing tests pass. The ENG-7 tests (21 total — 9 machine + 12 integration) must still pass. No new test files are required for this issue since the audit log writes are best-effort observability (not business logic), but verify nothing is broken.

**Known test setup:** Integration tests use vitest with `convex-test`. The vite config has `test.server.deps.inline: ["fluent-convex"]` to fix ESM resolution. Test modules use `import.meta.glob("../../../../convex/**/*.*s")` and `convexTest(schema, modules)`.
