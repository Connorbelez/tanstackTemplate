# Chunk 01 Context: Test Infrastructure

## Goal
Build the shared test infrastructure that all auth tests depend on: role→permission truth table, mock utilities, pre-built identity fixtures, and test endpoints for chain testing.

## T-001: Role→Permission Truth Table (`src/test/auth/permissions.ts`)

Create `ROLE_PERMISSIONS: Record<string, string[]>` mapping every role to its exact permissions. Also export a `lookupPermissions(roles: string[]): string[]` function that unions permissions across multiple roles (for multi-role identities).

### Exact permissions per role (from Authorization & Access Control architecture):

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
    "deal:view", "ledger:view", "accrual:view",
    "listing:create", "listing:manage", "listing:view",
    "renewal:acknowledge",
  ],
  lender: [
    "lender:access", "onboarding:access",
    "deal:view", "ledger:view",
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

`lookupPermissions` should deduplicate when a user has multiple roles.

## T-002: Mock Utilities (`src/test/auth/helpers.ts`)

### MockIdentity interface
```typescript
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
```

### Functions to create:
1. `createMockIdentity(overrides?: Partial<MockIdentity>): MockIdentity` — defaults to member role
2. `createMockViewer(options: MockViewerOptions): MockIdentity` — builds from role list, auto-looks up permissions via `lookupPermissions`
3. `createTestConvex()` — wraps `convexTest(schema, modules)` + `auditLogTest.register(t, "auditLog")`
4. `seedUser(t, authId, email, firstName?, lastName?)` — inserts into `users` table
5. `seedFromIdentity(t, identity: MockIdentity)` — convenience wrapper around seedUser

### Existing pattern from `src/test/convex/onboarding/onboarding.test.ts`:
```typescript
import auditLogTest from "convex-audit-log/test";
import { convexTest } from "convex-test";
import schema from "../../../convex/schema";

const modules = import.meta.glob("../../../convex/**/*.*s");

function createTestConvex() {
  const t = convexTest(schema, modules);
  auditLogTest.register(t, "auditLog");
  return t;
}
```

Note: The `modules` glob path must be relative to the helpers.ts file location. Since helpers.ts is at `src/test/auth/helpers.ts`, the glob should be `../../../convex/**/*.*s`.

## T-003: Identity Fixtures (`src/test/auth/identities.ts`)

Pre-built identities for every role. Each uses `createMockViewer` from helpers.ts.

### Required identities:
| Name | Role(s) | Org ID | Key property |
|------|---------|--------|-------------|
| FAIRLEND_ADMIN | admin | FAIRLEND_STAFF_ORG_ID | isFairLendAdmin() === true |
| EXTERNAL_ORG_ADMIN | admin | "org_external_test" | isFairLendAdmin() === false |
| BROKER | broker | "org_brokerage_test" | broker:access |
| LENDER | lender | "org_brokerage_test" | lender:access |
| BORROWER | borrower | "org_brokerage_test" | borrower:access |
| LAWYER | lawyer | "org_lawfirm_test" | lawyer:access |
| JR_UNDERWRITER | jr_underwriter | undefined (no org needed) | underwriter:access, recommend only |
| UNDERWRITER | underwriter | undefined | underwriter:access, decide |
| SR_UNDERWRITER | sr_underwriter | undefined | underwriter:access, full queue |
| MEMBER | member | "org_brokerage_test" | onboarding:access only |

### Constants from `convex/constants.ts`:
```typescript
export const FAIRLEND_STAFF_ORG_ID = "org_01KKF56VABM4NYFFSR039RTJBM";
export const FAIRLEND_BROKERAGE_ORG_ID = "org_01KKKKGXEBW1MA5NFEZVHZS7WG";
export const FAIRLEND_LAWYERS_ORG_ID = "org_01KKRSS95YC96QA7M42C2ERVSM";
```

## T-004: Test Endpoints (`convex/test/authTestEndpoints.ts`)

Create minimal Convex functions that use each chain and return `{ ok: true }`. These exist purely for chain testing.

### Chains to create endpoints for (from `convex/fluent.ts` exports):
- `authedQuery` → `testAuthedQuery`
- `authedMutation` → `testAuthedMutation`
- `adminQuery` → `testAdminQuery` (uses `requireFairLendAdmin`)
- `adminMutation` → `testAdminMutation` (uses `requireAdmin`)
- `brokerQuery` → `testBrokerQuery`
- `brokerMutation` → `testBrokerMutation`
- `borrowerQuery` → `testBorrowerQuery`
- `borrowerMutation` → `testBorrowerMutation`
- `lenderQuery` → `testLenderQuery`
- `lenderMutation` → `testLenderMutation`
- `underwriterQuery` → `testUnderwriterQuery`
- `underwriterMutation` → `testUnderwriterMutation`
- `lawyerQuery` → `testLawyerQuery`
- `lawyerMutation` → `testLawyerMutation`
- `uwQuery` → `testUwQuery`
- `uwMutation` → `testUwMutation`
- `dealQuery` → `testDealQuery`
- `dealMutation` → `testDealMutation`
- `ledgerQuery` → `testLedgerQuery`

### Important fluent.ts details:
- All chain handlers use `.handler(async () => ({ ok: true })).public()` pattern
- The chains are defined as:
  - `adminQuery` uses `requireFairLendAdmin` (NOT `requireAdmin`) — only FairLend Staff org admin passes
  - `adminMutation` uses `requireAdmin` — any admin in any org passes
  - `brokerQuery/Mutation` uses `requirePermission("broker:access")`
  - `borrowerQuery/Mutation` uses `requirePermission("borrower:access")`
  - `lenderQuery/Mutation` uses `requirePermission("lender:access")`
  - `underwriterQuery/Mutation` uses `requirePermission("underwriter:access")` (same as uwQuery/Mutation — these are aliases)
  - `lawyerQuery/Mutation` uses `requirePermission("lawyer:access")`
  - `dealQuery/Mutation` uses `requirePermission("deal:view")` / `requirePermission("deal:manage")`
  - `ledgerQuery` uses `requirePermission("ledger:view")`

### Viewer interface (from fluent.ts):
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

## T-005: Run codegen
Run `bunx convex codegen` after creating the test endpoints file. Verify the generated `convex/_generated/api.d.ts` includes the new `api.test.authTestEndpoints` namespace.
