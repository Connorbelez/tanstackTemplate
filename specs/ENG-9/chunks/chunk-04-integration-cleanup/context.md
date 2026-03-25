# Chunk 04 Context: Integration Tests & Cleanup

## Goal
Integration tests for real business logic endpoints (onboarding mutations, audit failure logging) + final quality gates.

## T-015: onboarding-auth.test.ts

### Test onboarding mutations with shared auth fixtures.

**Endpoints to test (from `convex/onboarding/mutations.ts`):**
- `requestRole` — uses `authedMutation` chain (any authenticated user)
- `approveRequest` — uses `adminMutation.use(requirePermission("onboarding:review"))` chain
- `rejectRequest` — uses `adminMutation.use(requirePermission("onboarding:review"))` chain

**Note on adminMutation:** This uses `requireAdmin` (checks `roles.has("admin")`), NOT `requireFairLendAdmin`. So any admin in any org can call it, BUT the `requirePermission("onboarding:review")` additionally filters — only admins with `onboarding:review` permission pass.

Looking at ROLE_PERMISSIONS: only `admin` role has `onboarding:review`. EXTERNAL_ORG_ADMIN has `admin` role but may not have `onboarding:review` in their scoped permissions.

For testing: EXTERNAL_ORG_ADMIN should fail `approveRequest` because they don't have `onboarding:review` permission (even though they have admin role).

**Test cases:**

1. **`requestRole` accepts member with `onboarding:access`**
   - MEMBER identity → creates onboarding request
   - Args: `{ requestedRole: "broker", referralSource: "self_signup" }`

2. **`requestRole` rejects unauthenticated**
   - No identity → throws

3. **`approveRequest` accepts FairLend admin**
   - Create request first (as MEMBER), then approve (as FAIRLEND_ADMIN)
   - Args: `{ requestId: <id> }`

4. **`approveRequest` rejects broker**
   - BROKER doesn't have `onboarding:review` → throws

5. **`approveRequest` rejects external org admin**
   - EXTERNAL_ORG_ADMIN doesn't have `onboarding:review` → throws

6. **`rejectRequest` follows same auth rules**
   - FAIRLEND_ADMIN can reject, BROKER cannot

### requestRole input validator:
```typescript
{
  requestedRole: requestedRoleValidator,  // union of REQUESTABLE_ROLES
  referralSource: referralSourceValidator, // "self_signup" | "broker_invite"
  invitedByBrokerId: v.optional(v.string()),
}
```

### Setup for approval tests:
1. Seed MEMBER user
2. Seed FAIRLEND_ADMIN user
3. As MEMBER: call `requestRole` to create a request
4. As FAIRLEND_ADMIN: call `approveRequest` with the request ID

## T-016: audit-auth-failure.test.ts

### Test that `auditAuthFailure` writes audit events for mutation-backed denials.

**`auditAuthFailure` behavior (from `convex/auth/auditAuth.ts`):**
- Uses an internal mutation when the current context can call `runMutation`
- Query-only contexts still need message assertions because they don't have a write path in this test setup
- Calls `auditLog.log()` with action `"auth.{middleware}_denied"`, severity `"warning"`
- Graceful failure — catches errors without rethrowing

**Test cases:**

1. **`auditAuthFailure` writes in mutation context**
   - Keep the denial-path test that asserts the correct error message
   - Add a focused mutation-context test that invokes `auditAuthFailure` directly with a real Convex mutation ctx and a broker-shaped viewer
   - Query audit log entries to verify the expected auth denial event was persisted

   Note: `adminMutation` uses `requireAdmin` middleware which calls `auditAuthFailure()` on denial.

2. **Query denials still verify the error surface**
   - Call a query endpoint that fails auth (e.g., `testAdminQuery` with BROKER identity)
   - Verify the thrown error message identifies the middleware that denied access

3. **Audit entry contains correct metadata**
   - On a mutation-backed denial, verify the audit log entry has:
     - action matching `"auth.*_denied"` pattern
     - severity: `"warning"`
     - metadata including: middleware name, reason, viewer roles/permissions, orgId

### Querying audit log entries
Prefer the typed audit query API over broad table scans. Scope assertions to the denied actor and expected action/resource:
```typescript
const auditEntries = await t
  .withIdentity(FAIRLEND_ADMIN)
  .query(api.audit.queries.getAuthEventsByActor, {
    actorId: BROKER.subject,
    limit: 20,
  });
```

When you need a request-specific onboarding audit assertion, filter by the exact request rather than collecting everything:
```typescript
const auditEntries = await t
  .withIdentity(FAIRLEND_ADMIN)
  .query(api.audit.queries.getAuditTrailForRequest, {
    requestId,
  });
```

Then assert against the specific denial or transition metadata you expect instead of treating the thrown error as sufficient proof that auditing happened.

## T-017 & T-018: Quality Gates

Run in order:
1. `bun check` — auto-formats, fixes lint issues
2. `bun typecheck` — TypeScript type checking
3. `bunx convex codegen` — if any Convex files changed
4. `bun test` — run all tests

Fix any failures before moving on.
