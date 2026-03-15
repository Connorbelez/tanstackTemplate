# ENG-9 Implementation Plan — Auth Test Harness & Integration Test Suite

## Source Context
- **Linear issue:** [ENG-9](https://linear.app/fairlend/issue/ENG-9/build-auth-test-harness-and-integration-test-suite)
- **RBAC Technical Design:** [Notion](https://www.notion.so/322fc1b44024811cbccad22752327a08)
- **Authorization Architecture:** [Notion](https://www.notion.so/321fc1b440248127a3bef2ea0371aaf6)
- **Related issues:** ENG-2 (JWT Viewer), ENG-3 (Org Context MW), ENG-4 (Chain Library), ENG-5 (Frontend Auth), ENG-6 (Resource Ownership), ENG-7 (Onboarding GT), ENG-8 (Audit Logging)

---

## Goal

Build a test harness and comprehensive test suite for the auth system. The harness provides reusable mock utilities (`createMockViewer`, `createMockIdentity`, `withAuth`) that all auth-related test files in the project can consume. The test suite covers every role, every permission, and every middleware chain with both positive and negative cases.

---

## Current State

### What exists
- `convex/fluent.ts` — Full middleware system with `Viewer` interface, `authMiddleware`, `requireFairLendAdmin`, `requireOrgContext`, `requireAdmin`, `requirePermission`, and 20+ pre-built chains
- `convex/constants.ts` — `FAIRLEND_STAFF_ORG_ID`, `FAIRLEND_BROKERAGE_ORG_ID`, `FAIRLEND_LAWYERS_ORG_ID`, `REQUESTABLE_ROLES`
- `convex/auth/auditAuth.ts` — `auditAuthFailure()` helper with `isMutationContext()` guard
- `convex/onboarding/mutations.ts` — `requestRole`, `approveRequest`, `rejectRequest` mutations using the middleware chains
- `src/test/convex/auth.test.ts` — Existing unit tests for webhook handler logic (upsert/delete patterns). Uses mock DB objects, NOT `convex-test`.
- `src/test/convex/onboarding/onboarding.test.ts` — Integration tests using `convex-test` + `withIdentity()`. Contains inline identity shapes. This is the established pattern.

### What's missing
- No shared mock utilities — each test file defines its own identity objects inline
- No systematic coverage of role→permission assignments
- No negative tests for middleware denial paths (wrong role, missing org context, missing permission)
- No tests for `parseClaimArray()` edge cases (JSON strings, arrays, empty values)
- No tests for `isFairLendAdmin()` org-scoping (admin in FairLend Staff vs admin in external org)
- No tests for the 7 new permissions: `deal:view`, `deal:manage`, `ledger:view`, `ledger:correct`, `accrual:view`, `dispersal:view`, `obligation:waive`
- No tests for `underwriter` middle tier (`decide`, `review_decisions`, `view_team_metrics`)
- Tests still reference legacy roles that have been removed (`investor`, `platform_admin`, `org_admin`, `uw_manager`)

---

## Architecture

### File structure

```
src/test/
  auth/                                 ← NEW directory
    helpers.ts                          ← Mock utilities (createMockViewer, createMockIdentity, withAuth)
    identities.ts                       ← Pre-built identity fixtures for every role
    permissions.ts                      ← Role→permission mapping as test truth table
    middleware/
      authMiddleware.test.ts            ← Viewer construction, parseClaimArray edge cases
      requireFairLendAdmin.test.ts      ← FairLend Staff admin vs external org admin
      requireOrgContext.test.ts         ← Org presence, underwriter bypass
      requirePermission.test.ts         ← Permission checks, denial paths
      requireAdmin.test.ts              ← Admin role check
    chains/
      role-chains.test.ts              ← All pre-built chains (brokerQuery, lenderQuery, etc.)
    permissions/
      role-permission-matrix.test.ts   ← Systematic positive+negative for every role×permission
      new-permissions.test.ts          ← 7 new permissions with correct role assignments
    integration/
      onboarding-auth.test.ts          ← Onboarding mutations with auth enforcement
      audit-auth-failure.test.ts       ← auditAuthFailure logging in mutation context
```

### Test approach

1. **Unit tests (vitest)** for pure functions and Viewer construction logic — `parseClaimArray`, `isFairLendAdmin` derivation, `hasUnderwriterRole`
2. **Integration tests (convex-test)** for middleware chains calling real Convex functions — uses `withIdentity()` to set JWT claims, calls actual query/mutation endpoints, verifies access granted or `ConvexError` thrown

### Key conventions (from existing onboarding tests)
- Use `convexTest(schema, modules)` with `import.meta.glob` for Convex module loading
- Register components: `auditLogTest.register(t, "auditLog")`
- Identity objects use raw JWT claim fields: `subject`, `issuer`, `org_id`, `role`, `roles` (JSON string), `permissions` (JSON string), `user_email`, `user_first_name`, `user_last_name`
- `t.withIdentity(identity)` creates a scoped client for that user
- `t.run(async (ctx) => { ... })` for direct DB reads in assertions
- Seed users with `ctx.db.insert("users", { authId, email, firstName, lastName })`

---

## Detailed Design

### 1. Mock Utilities (`src/test/auth/helpers.ts`)

```typescript
import { FAIRLEND_STAFF_ORG_ID } from "../../../convex/constants";

/**
 * Identity object compatible with convex-test withIdentity().
 * Mirrors the JWT custom claims structure from WorkOS.
 */
export interface MockIdentity {
  subject: string;
  issuer: string;
  org_id?: string;
  organization_name?: string;
  role?: string;
  roles: string;          // JSON-stringified string[]
  permissions: string;    // JSON-stringified string[]
  user_email: string;
  user_first_name: string;
  user_last_name: string;
}

/**
 * Creates a mock identity with sensible defaults that can be selectively overridden.
 * The identity shape matches what convex-test's withIdentity() expects.
 */
export function createMockIdentity(overrides: Partial<MockIdentity> = {}): MockIdentity {
  return {
    subject: "user_test_default",
    issuer: "https://api.workos.com",
    roles: JSON.stringify(["member"]),
    permissions: JSON.stringify(["onboarding:access"]),
    user_email: "testuser@example.com",
    user_first_name: "Test",
    user_last_name: "User",
    ...overrides,
  };
}

/**
 * Viewer-style overrides for creating identities from a role-centric perspective.
 * Maps role names to their expected permissions, then produces a MockIdentity.
 */
export interface MockViewerOptions {
  roles: string[];
  permissions?: string[];  // If not provided, looked up from ROLE_PERMISSIONS
  orgId?: string;
  orgName?: string;
  subject?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export function createMockViewer(options: MockViewerOptions): MockIdentity {
  const permissions = options.permissions ?? lookupPermissions(options.roles);
  return createMockIdentity({
    subject: options.subject ?? `user_${options.roles[0]}_${Date.now()}`,
    org_id: options.orgId,
    organization_name: options.orgName,
    role: options.roles[0],
    roles: JSON.stringify(options.roles),
    permissions: JSON.stringify(permissions),
    user_email: options.email ?? `${options.roles[0]}@test.com`,
    user_first_name: options.firstName ?? options.roles[0],
    user_last_name: options.lastName ?? "Tester",
  });
}
```

The `lookupPermissions(roles)` function references the truth table in `permissions.ts`.

### 2. Identity Fixtures (`src/test/auth/identities.ts`)

Pre-built identities for every role, ready to use with `t.withIdentity()`:

```typescript
/** Admin in FairLend Staff org → isFairLendAdmin() === true */
export const FAIRLEND_ADMIN: MockIdentity

/** Admin in an external brokerage org → isFairLendAdmin() === false, only org:manage_* */
export const EXTERNAL_ORG_ADMIN: MockIdentity

/** Broker in their own brokerage org */
export const BROKER: MockIdentity

/** Lender (NOT investor) in a brokerage org */
export const LENDER: MockIdentity

/** Borrower in a brokerage org */
export const BORROWER: MockIdentity

/** Lawyer in a law firm org */
export const LAWYER: MockIdentity

/** Jr Underwriter — recommend only, decisions need sign-off */
export const JR_UNDERWRITER: MockIdentity

/** Underwriter — middle tier, decide + review_decisions + view_team_metrics */
export const UNDERWRITER: MockIdentity

/** Sr Underwriter — full queue visibility, review_samples, reassign, configure_queue */
export const SR_UNDERWRITER: MockIdentity

/** Member — default role, only onboarding:access */
export const MEMBER: MockIdentity

/** Unauthenticated — no identity (null) — used to test authMiddleware rejection */
// (no object — pass undefined to withIdentity or call without it)
```

Each identity includes the **exact permissions** from the role→permission matrix in the Authorization Architecture page. For example, `LENDER` gets:
```
lender:access, onboarding:access, deal:view, ledger:view, accrual:view,
dispersal:view, listing:view, listing:invest, portfolio:view,
portfolio:signal_renewal, portfolio:export_tax
```

### 3. Role→Permission Truth Table (`src/test/auth/permissions.ts`)

A single source of truth for which permissions each role gets. This is extracted verbatim from the [Authorization & Access Control](https://www.notion.so/321fc1b440248127a3bef2ea0371aaf6) role→permission matrix. The table drives both the identity fixtures and the systematic matrix tests.

```typescript
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    "admin:access", "broker:access", "underwriter:access", "lawyer:access",
    "onboarding:access", "onboarding:review", "role:assign",
    "application:create", "application:triage", "application:review", "application:manage",
    "underwriting:view_queue", "underwriting:reassign", "underwriting:configure_queue",
    "underwriting:view_all", "underwriting:view_team_metrics",
    "offer:create", "offer:manage",
    "condition:review", "condition:waive",
    "mortgage:originate", "mortgage:service",
    "payment:manage",
    "document:upload", "document:review", "document:generate",
    "deal:view", "deal:manage",
    "ledger:view", "ledger:correct",
    "accrual:view", "dispersal:view",
    "listing:create", "listing:manage",
    "renewal:acknowledge", "renewal:manage",
    "org:manage_members", "org:manage_settings",
    "platform:manage_users", "platform:manage_orgs", "platform:manage_roles",
    "platform:view_audit", "platform:manage_system",
    "obligation:waive",
  ],
  broker: [
    "broker:access", "onboarding:access",
    "application:create",
    "offer:create", "offer:manage",
    "condition:submit",
    "mortgage:service",
    "document:upload",
    "deal:view",
    "ledger:view",
    "accrual:view",
    "listing:create", "listing:manage", "listing:view",
    "renewal:acknowledge",
  ],
  lender: [
    "lender:access", "onboarding:access",
    "deal:view",
    "ledger:view",
    "accrual:view", "dispersal:view",
    "listing:view", "listing:invest",
    "portfolio:view", "portfolio:signal_renewal", "portfolio:export_tax",
  ],
  borrower: [
    "borrower:access", "onboarding:access",
    "condition:submit",
    "mortgage:view_own",
    "payment:view_own", "payment:reschedule_own",
    "document:upload", "document:sign",
    "renewal:signal",
  ],
  lawyer: [
    "lawyer:access", "onboarding:access",
    "deal:view",
  ],
  jr_underwriter: [
    "underwriter:access",
    "application:review",
    "underwriting:view_queue", "underwriting:claim", "underwriting:release",
    "underwriting:recommend",
    "condition:review",
    "document:review",
  ],
  underwriter: [
    "underwriter:access",
    "application:review",
    "underwriting:view_queue", "underwriting:claim", "underwriting:release",
    "underwriting:decide", "underwriting:review_decisions",
    "underwriting:view_team_metrics",
    "condition:review",
    "document:review",
  ],
  sr_underwriter: [
    "underwriter:access",
    "application:review",
    "underwriting:view_queue", "underwriting:claim", "underwriting:release",
    "underwriting:decide", "underwriting:review_decisions",
    "underwriting:review_samples", "underwriting:reassign",
    "underwriting:configure_queue", "underwriting:view_all",
    "underwriting:view_team_metrics",
    "condition:review",
    "document:review",
  ],
  member: [
    "onboarding:access",
  ],
};
```

The `lookupPermissions(roles: string[])` function unions the permissions from all provided roles.

### 4. Middleware Unit Tests

#### `authMiddleware.test.ts`

Tests the Viewer construction path using `convex-test` integration:

| Test | Description |
|------|-------------|
| Rejects unauthenticated access | No identity → throws "Unauthorized: sign in required" |
| Builds Viewer from JWT claims | Roles/permissions extracted from identity, Sets constructed |
| Parses roles from JSON string | `roles: '["admin","broker"]'` → Set with both |
| Parses roles from array | `roles: ["admin","broker"]` → Set with both |
| Handles empty/missing claims | `roles: undefined` → empty Set, `permissions: ""` → empty Set |
| Sets `isFairLendAdmin` true | admin role + FairLend Staff org_id → `isFairLendAdmin: true` |
| Sets `isFairLendAdmin` false for external admin | admin role + external org_id → `isFairLendAdmin: false` |
| Sets `isFairLendAdmin` false for non-admin | broker role + FairLend Staff org_id → `isFairLendAdmin: false` |

Uses the `whoAmI` query (`convex/fluent.ts:347-357`) which is already exported and returns the viewer. This is the simplest way to test authMiddleware in integration — call `whoAmI` with different identities and assert the returned viewer shape.

#### `requireFairLendAdmin.test.ts`

| Test | Description |
|------|-------------|
| Allows FairLend Staff admin | `adminQuery` with FAIRLEND_ADMIN identity → succeeds |
| Rejects external org admin | `adminQuery` with EXTERNAL_ORG_ADMIN identity → throws "Forbidden: fair lend admin role required" |
| Rejects non-admin with FairLend Staff org | broker in FairLend Staff org → throws |
| Rejects admin with no org context | admin role but no org_id → throws |

Tested via a simple `adminQuery` endpoint (can use `whoAmI`-style query wrapped in `adminQuery` chain, or test the existing `approveRequest` mutation path).

#### `requireOrgContext.test.ts`

| Test | Description |
|------|-------------|
| Allows user with org_id present | Broker with org_id → passes |
| Allows underwriter without org_id | jr_underwriter with no org_id → passes (bypass) |
| Allows sr_underwriter without org_id | sr_underwriter with no org_id → passes (bypass) |
| Rejects non-underwriter without org_id | Broker with no org_id → throws "Forbidden: org context required" |

#### `requirePermission.test.ts`

| Test | Description |
|------|-------------|
| Allows user with matching permission | Broker with `broker:access` calling `brokerQuery` → succeeds |
| Rejects user without matching permission | Borrower calling `brokerQuery` → throws "Forbidden: permission \"broker:access\" required" |
| Tests parameterized permission string | `requirePermission("deal:manage")` → only admin passes |

#### `requireAdmin.test.ts`

| Test | Description |
|------|-------------|
| Allows any admin (any org) | Admin role (any org) → passes |
| Rejects non-admin | Broker role → throws "Forbidden: admin role required" |

### 5. Chain Tests (`role-chains.test.ts`)

For each of the 20+ pre-built chains in `convex/fluent.ts`, test that the correct roles can call them and incorrect roles are rejected. Uses test endpoints — either existing mutations/queries or minimal test helpers.

**Strategy:** Create a minimal test query/mutation file (`convex/test/authTestEndpoints.ts`) that exports one endpoint per chain, each returning `{ ok: true }`. This avoids coupling chain tests to business logic.

```typescript
// convex/test/authTestEndpoints.ts
import {
  authedQuery, adminQuery, brokerQuery, brokerMutation,
  borrowerQuery, lenderQuery, lenderMutation,
  underwriterQuery, lawyerQuery, uwQuery,
  dealQuery, dealMutation, ledgerQuery,
} from "../fluent";

export const testAuthed = authedQuery.handler(async () => ({ ok: true })).public();
export const testAdmin = adminQuery.handler(async () => ({ ok: true })).public();
export const testBroker = brokerQuery.handler(async () => ({ ok: true })).public();
// ... one per chain
```

**Chain × Role matrix (critical subset):**

| Chain | FAIRLEND_ADMIN | BROKER | LENDER | BORROWER | LAWYER | JR_UW | UW | SR_UW | MEMBER | EXTERNAL_ADMIN |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `authedQuery` | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| `adminQuery` | pass | fail | fail | fail | fail | fail | fail | fail | fail | fail |
| `brokerQuery` | pass* | pass | fail | fail | fail | fail | fail | fail | fail | fail |
| `lenderQuery` | fail | fail | pass | fail | fail | fail | fail | fail | fail | fail |
| `borrowerQuery` | fail | fail | fail | pass | fail | fail | fail | fail | fail | fail |
| `lawyerQuery` | pass* | fail | fail | fail | pass | fail | fail | fail | fail | fail |
| `uwQuery` | pass | fail | fail | fail | fail | pass | pass | pass | fail | fail |
| `dealQuery` | pass | pass | pass | fail | pass | fail | fail | fail | fail | fail |
| `ledgerQuery` | pass | pass | pass | fail | fail | fail | fail | fail | fail | fail |

*`pass*` = FairLend admin has `broker:access` and `lawyer:access` in their permissions.

Note: `adminQuery` uses `requireFairLendAdmin` (not `requireAdmin`), so only FairLend Staff org admin passes — external org admin fails.

### 6. Permission Matrix Tests (`role-permission-matrix.test.ts`)

Systematic test using `describe.each` over the `ROLE_PERMISSIONS` table:

```typescript
describe.each(Object.entries(ROLE_PERMISSIONS))("Role: %s", (role, expectedPermissions) => {
  it("has correct permissions", () => {
    // Verify the fixture identity's permissions match the truth table
  });

  it("does not have permissions from other roles", () => {
    // Verify the fixture does NOT have permissions exclusively belonging to other roles
  });
});
```

### 7. New Permission Tests (`new-permissions.test.ts`)

Specific tests for the 7 new permissions from ENG-9:

| Permission | Allowed Roles | Denied Roles |
|------------|---------------|--------------|
| `deal:view` | admin, broker, lender, lawyer | borrower, jr_uw, uw, sr_uw, member |
| `deal:manage` | admin only | broker, lender, lawyer, borrower, all uw, member |
| `ledger:view` | admin, broker, lender | borrower, lawyer, all uw, member |
| `ledger:correct` | admin only | broker, lender, borrower, lawyer, all uw, member |
| `accrual:view` | admin, broker, lender | borrower, lawyer, all uw, member |
| `dispersal:view` | admin, lender | broker, borrower, lawyer, all uw, member |
| `obligation:waive` | admin only | broker, lender, borrower, lawyer, all uw, member |

Each permission tested with both the chain-level check (e.g., `dealQuery`) and the raw permission check via the `whoAmI` query's returned permissions.

### 8. Underwriter Tier Tests (within `role-permission-matrix.test.ts`)

The underwriting hierarchy is a key authorization boundary:

| Permission | jr_underwriter | underwriter | sr_underwriter |
|------------|:-:|:-:|:-:|
| `underwriting:view_queue` | yes | yes | yes |
| `underwriting:claim` | yes | yes | yes |
| `underwriting:release` | yes | yes | yes |
| `underwriting:recommend` | **yes** | no | no |
| `underwriting:decide` | no | **yes** | **yes** |
| `underwriting:review_decisions` | no | **yes** | **yes** |
| `underwriting:review_samples` | no | no | **yes** |
| `underwriting:reassign` | no | no | **yes** |
| `underwriting:configure_queue` | no | no | **yes** |
| `underwriting:view_all` | no | no | **yes** |
| `underwriting:view_team_metrics` | no | **yes** | **yes** |

### 9. Integration Tests

#### `onboarding-auth.test.ts`

Tests that onboarding mutations enforce their auth chains:

| Test | Description |
|------|-------------|
| `requestRole` accepts member with `onboarding:access` | Member identity can create request |
| `requestRole` rejects unauthenticated | No identity → throws |
| `approveRequest` accepts FairLend admin with `onboarding:review` | Admin identity succeeds |
| `approveRequest` rejects broker | Broker doesn't have `onboarding:review` → throws |
| `approveRequest` rejects external org admin | External admin doesn't pass `requireFairLendAdmin` → throws |
| `rejectRequest` follows same auth rules as approve | Same admin-only enforcement |

This file extends the existing `onboarding.test.ts` patterns but focuses on the auth enforcement rather than the business logic.

#### `audit-auth-failure.test.ts`

Tests that auth failures are correctly audit-logged:

| Test | Description |
|------|-------------|
| `auditAuthFailure` writes to auditLog in mutation context | Call a mutation that fails auth → verify auditLog entry |
| `auditAuthFailure` is a no-op in query context | Call a query that fails auth → no auditLog entry (not a mutation context) |
| Audit entry contains correct metadata | Verify `middleware`, `required`, `reason`, `userRoles`, `userPermissions`, `orgId` fields |

### 10. Deprecated Role Validation

A sweep test that the entire test suite contains zero references to removed roles:

```typescript
describe("no references to deprecated roles", () => {
  it("no investor references", () => {
    // Verify ROLE_PERMISSIONS has no "investor" key
    // Verify no identity fixture references "investor"
  });
  it("no platform_admin references", () => { ... });
  it("no org_admin references", () => { ... });
  it("no uw_manager references", () => { ... });
});
```

---

## Test Infrastructure Setup

### Test helper for `convex-test` boilerplate

Extract the common setup from `onboarding.test.ts` into the shared helpers:

```typescript
// src/test/auth/helpers.ts (continued)

import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";

const modules = import.meta.glob("../../../convex/**/*.*s");

/** Create a convex-test instance with audit log component registered. */
export function createTestConvex() {
  const t = convexTest(schema, modules);
  auditLogTest.register(t, "auditLog");
  return t;
}

/** Seed a user in the DB so Convex functions can look them up by authId. */
export async function seedUser(
  t: ReturnType<typeof convexTest>,
  authId: string,
  email: string,
  firstName = "Test",
  lastName = "User",
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("users", { authId, email, firstName, lastName });
  });
}

/** Seed a user matching an identity fixture. */
export async function seedFromIdentity(
  t: ReturnType<typeof convexTest>,
  identity: MockIdentity,
) {
  return seedUser(
    t,
    identity.subject,
    identity.user_email,
    identity.user_first_name,
    identity.user_last_name,
  );
}
```

### Test endpoints file

```typescript
// convex/test/authTestEndpoints.ts
//
// Minimal endpoints that expose each middleware chain for testing.
// Each returns { ok: true } — we're testing the auth gate, not business logic.
// This file is only loaded by tests (via import.meta.glob) and never deployed.

import { v } from "convex/values";
import {
  authedQuery, authedMutation, adminQuery, adminMutation,
  brokerQuery, brokerMutation, borrowerQuery, borrowerMutation,
  lenderQuery, lenderMutation, underwriterQuery, underwriterMutation,
  lawyerQuery, lawyerMutation, uwQuery, uwMutation,
  dealQuery, dealMutation, ledgerQuery,
  requirePermission,
} from "../fluent";

export const testAuthedQuery = authedQuery.handler(async () => ({ ok: true })).public();
export const testAdminQuery = adminQuery.handler(async () => ({ ok: true })).public();
export const testBrokerQuery = brokerQuery.handler(async () => ({ ok: true })).public();
export const testBrokerMutation = brokerMutation.handler(async () => ({ ok: true })).public();
export const testBorrowerQuery = borrowerQuery.handler(async () => ({ ok: true })).public();
export const testLenderQuery = lenderQuery.handler(async () => ({ ok: true })).public();
export const testLenderMutation = lenderMutation.handler(async () => ({ ok: true })).public();
export const testUnderwriterQuery = underwriterQuery.handler(async () => ({ ok: true })).public();
export const testLawyerQuery = lawyerQuery.handler(async () => ({ ok: true })).public();
export const testUwQuery = uwQuery.handler(async () => ({ ok: true })).public();
export const testDealQuery = dealQuery.handler(async () => ({ ok: true })).public();
export const testDealMutation = dealMutation.handler(async () => ({ ok: true })).public();
export const testLedgerQuery = ledgerQuery.handler(async () => ({ ok: true })).public();
```

---

## Implementation Order

### Phase 1: Test Infrastructure (no test files yet)

1. Create `src/test/auth/permissions.ts` — the role→permission truth table
2. Create `src/test/auth/helpers.ts` — `createMockIdentity`, `createMockViewer`, `createTestConvex`, `seedUser`, `seedFromIdentity`, `lookupPermissions`
3. Create `src/test/auth/identities.ts` — pre-built identity fixtures for all 10 roles
4. Create `convex/test/authTestEndpoints.ts` — minimal chain test endpoints
5. Run `bunx convex codegen` to generate API types for the new test endpoints

### Phase 2: Middleware Unit Tests

6. Create `src/test/auth/middleware/authMiddleware.test.ts` — Viewer construction, claim parsing, isFairLendAdmin derivation
7. Create `src/test/auth/middleware/requireFairLendAdmin.test.ts` — FairLend Staff admin vs external org admin
8. Create `src/test/auth/middleware/requireOrgContext.test.ts` — org presence, underwriter bypass
9. Create `src/test/auth/middleware/requirePermission.test.ts` — permission checks, denial paths
10. Create `src/test/auth/middleware/requireAdmin.test.ts` — admin role check

### Phase 3: Chain & Permission Tests

11. Create `src/test/auth/chains/role-chains.test.ts` — every chain × every role
12. Create `src/test/auth/permissions/role-permission-matrix.test.ts` — systematic positive+negative via `describe.each`
13. Create `src/test/auth/permissions/new-permissions.test.ts` — 7 new permissions with correct role assignments
14. Add deprecated role validation tests to `role-permission-matrix.test.ts`

### Phase 4: Integration Tests

15. Create `src/test/auth/integration/onboarding-auth.test.ts` — auth enforcement on onboarding mutations
16. Create `src/test/auth/integration/audit-auth-failure.test.ts` — audit logging of auth failures

### Phase 5: Cleanup & Verification

17. Run `bun check` — lint/format
18. Run `bun typecheck` — type safety
19. Run `bun test` — all tests pass
20. Verify zero references to `investor`, `platform_admin`, `org_admin`, `uw_manager` in new test files

---

## Constraints & Gotchas

### `withIdentity()` claim format
WorkOS JWT claims arrive as JSON strings in some environments and as parsed arrays in others. The `parseClaimArray()` function in `fluent.ts` handles both. Test both formats:
```typescript
// JSON string format (what WorkOS actually sends)
roles: JSON.stringify(["admin", "broker"])

// Array format (what some test environments might produce)
roles: ["admin", "broker"]
```

### `auditAuthFailure` only writes in mutation context
The `isMutationContext(ctx)` guard means auth failures in **queries** are silently dropped (no audit log entry). This is by design — queries don't have write access. Tests should verify this behavior explicitly.

### `requireOrgContext` underwriter bypass
Underwriters bypass the org context check because they're always in FairLend Staff org. The middleware checks `hasUnderwriterRole()` which uses Set intersection. Test that `jr_underwriter`, `underwriter`, and `sr_underwriter` all bypass, but `admin` (even FairLend Staff admin) does NOT bypass — admin still needs org_id.

### Viewer uses `Set<string>` for roles and permissions
The `Viewer` interface stores `roles: Set<string>` and `permissions: Set<string>`. When returning viewer from `whoAmI`, they're spread to arrays. The middleware checks use `.has()` method. Test Set behavior with overlapping roles (multi-role users like admin+broker).

### Convex test endpoint visibility
The `convex/test/authTestEndpoints.ts` file will be included in `convex codegen`. This is fine — it's standard practice to have test-only Convex functions. They're only called by tests, never deployed to production.

### No mocking of middleware internals
Don't mock `authMiddleware`, `requirePermission`, etc. in isolation. The value of these tests is proving the real middleware chain works end-to-end with `convex-test`. Mock only the JWT identity via `withIdentity()`.
