# Chunk 02 Context: Middleware Unit Tests

## Goal
Create integration tests (using convex-test) for each middleware in the auth chain. Tests call real Convex endpoints via the test harness — no mocking of middleware internals.

## Shared Test Setup Pattern
Every test file should:
1. Import `createTestConvex`, `seedFromIdentity` from `../helpers`
2. Import identity fixtures from `../identities`
3. Import `api` from `../../../../convex/_generated/api`
4. Use `createTestConvex()` to get a test instance
5. Seed users before calling endpoints
6. Use `t.withIdentity(identity).query(...)` or `.mutation(...)` to invoke

```typescript
import { expect, describe, it } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "../../../../convex/_generated/api";
import { createTestConvex, seedFromIdentity } from "../helpers";
import { FAIRLEND_ADMIN, BROKER, MEMBER, ... } from "../identities";
```

## T-006: authMiddleware.test.ts

### Test the `whoAmI` query which exercises authMiddleware directly.

**Test cases:**
1. **Rejects unauthenticated access** — call without identity → throws "Unauthorized: sign in required"
2. **Builds Viewer from JWT claims** — BROKER identity → returned viewer has correct roles, permissions, orgId
3. **Parses roles from JSON string** — `roles: '["admin","broker"]'` → viewer.roles contains both
4. **Parses roles from array** — `roles: ["admin","broker"]` → viewer.roles contains both (tests parseClaimArray flexibility)
5. **Handles empty/missing claims** — `roles: undefined, permissions: ""` → empty arrays returned
6. **Sets isFairLendAdmin true** — FAIRLEND_ADMIN identity → isFairLendAdmin === true
7. **Sets isFairLendAdmin false for external admin** — EXTERNAL_ORG_ADMIN identity → isFairLendAdmin === false
8. **Sets isFairLendAdmin false for non-admin** — BROKER in FairLend Staff org → isFairLendAdmin === false

### `whoAmI` query location: `convex/fluent.ts` lines 347-357
Returns: `{ authId, email, firstName, lastName, role, roles: [...viewer.roles], permissions: [...viewer.permissions], orgId, orgName, isFairLendAdmin }`

### parseClaimArray behavior (from fluent.ts):
- Input is `unknown`
- If `undefined` or `null` → returns `[]`
- If `string` → tries `JSON.parse`, falls back to `[]` on parse error
- If already `Array` → returns as-is
- Empty string `""` → returns `[]`

## T-007: requireFairLendAdmin.test.ts

### Test the `adminQuery` chain which uses `requireFairLendAdmin`.

**Test cases:**
1. **Allows FairLend Staff admin** — FAIRLEND_ADMIN → `testAdminQuery` succeeds, returns `{ ok: true }`
2. **Rejects external org admin** — EXTERNAL_ORG_ADMIN → throws "Forbidden: fair lend admin role required"
3. **Rejects non-admin with FairLend Staff org** — create a BROKER identity with `org_id: FAIRLEND_STAFF_ORG_ID` → throws
4. **Rejects admin with no org context** — admin role but no org_id → throws

### requireFairLendAdmin implementation:
Checks `context.viewer.isFairLendAdmin` which is computed as: `org_id === FAIRLEND_STAFF_ORG_ID && roleSet.has("admin")`

## T-008: requireOrgContext.test.ts

### Test using a chain that includes requireOrgContext (e.g., brokerQuery).

**Test cases:**
1. **Allows user with org_id present** — BROKER with org_id → passes
2. **Allows jr_underwriter without org_id** — JR_UNDERWRITER (no org_id) → passes (bypass)
3. **Allows sr_underwriter without org_id** — SR_UNDERWRITER (no org_id) → passes (bypass)
4. **Rejects non-underwriter without org_id** — create identity with broker role but NO org_id → throws "Forbidden: org context required"

### requireOrgContext implementation:
- Checks if `viewer.orgId` is present OR `hasUnderwriterRole(viewer).hasRole`
- `hasUnderwriterRole` checks for intersection of viewer.roles with Set(["sr_underwriter", "jr_underwriter", "underwriter"])

### Important: brokerQuery chain composition
`brokerQuery = authedQuery.use(requireOrgContext).use(requirePermission("broker:access"))`
To test requireOrgContext in isolation, we may need to create a broker identity WITHOUT org_id, which should fail at requireOrgContext (not at requirePermission).

For the underwriter bypass tests, use `testUwQuery` or `testUnderwriterQuery` — underwriters have `underwriter:access` and can bypass org context.

## T-009: requirePermission.test.ts

### Test permission checking across different chains.

**Test cases:**
1. **Allows user with matching permission** — BROKER calling `testBrokerQuery` (requires `broker:access`) → succeeds
2. **Rejects user without matching permission** — BORROWER calling `testBrokerQuery` → throws (borrower doesn't have `broker:access`)
3. **Tests parameterized permission** — `testDealMutation` (requires `deal:manage`) → only FAIRLEND_ADMIN passes, BROKER fails

## T-010: requireAdmin.test.ts

### Test the `adminMutation` chain which uses `requireAdmin`.

**Test cases:**
1. **Allows any admin (any org)** — EXTERNAL_ORG_ADMIN calling `testAdminMutation` → passes (requireAdmin checks role, not org)
2. **Rejects non-admin** — BROKER calling `testAdminMutation` → throws "Forbidden: admin role required"

### Key difference: `adminQuery` vs `adminMutation`
- `adminQuery` uses `requireFairLendAdmin` — only FairLend Staff org admin
- `adminMutation` uses `requireAdmin` — any admin in any org
