# Chunk 03 Context: Chain & Permission Tests

## Goal
Systematic testing of all middleware chains and the complete role→permission matrix. This is the core coverage for the auth system.

## T-011: role-chains.test.ts

### Chain × Role Matrix
Test every pre-built chain against every role identity. Use `describe.each` for the matrix.

**Test endpoints available** (from `convex/test/authTestEndpoints.ts`):
- `testAuthedQuery` — any authenticated user
- `testAdminQuery` — `requireFairLendAdmin` (FairLend Staff admin only)
- `testAdminMutation` — `requireAdmin` (any admin in any org)
- `testBrokerQuery` — `requirePermission("broker:access")`
- `testBrokerMutation` — `requirePermission("broker:access")`
- `testBorrowerQuery` — `requirePermission("borrower:access")`
- `testBorrowerMutation` — `requirePermission("borrower:access")`
- `testLenderQuery` — `requirePermission("lender:access")`
- `testLenderMutation` — `requirePermission("lender:access")`
- `testUnderwriterQuery` — `requirePermission("underwriter:access")`
- `testUnderwriterMutation` — `requirePermission("underwriter:access")`
- `testLawyerQuery` — `requirePermission("lawyer:access")`
- `testLawyerMutation` — `requirePermission("lawyer:access")`
- `testUwQuery` — `requirePermission("underwriter:access")` (alias)
- `testUwMutation` — `requirePermission("underwriter:access")` (alias)
- `testDealQuery` — `requirePermission("deal:view")`
- `testDealMutation` — `requirePermission("deal:manage")`
- `testLedgerQuery` — `requirePermission("ledger:view")`

**Expected results (critical subset):**

| Chain | FAIRLEND_ADMIN | EXT_ADMIN | BROKER | LENDER | BORROWER | LAWYER | JR_UW | UW | SR_UW | MEMBER |
|-------|-------|---------|--------|--------|----------|--------|-------|-----|-------|--------|
| authedQuery | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| adminQuery | pass | fail | fail | fail | fail | fail | fail | fail | fail | fail |
| adminMutation | pass | pass | fail | fail | fail | fail | fail | fail | fail | fail |
| brokerQuery | pass* | fail | pass | fail | fail | fail | fail | fail | fail | fail |
| lenderQuery | fail | fail | fail | pass | fail | fail | fail | fail | fail | fail |
| borrowerQuery | fail | fail | fail | fail | pass | fail | fail | fail | fail | fail |
| lawyerQuery | pass* | fail | fail | fail | fail | pass | fail | fail | fail | fail |
| uwQuery | pass | fail | fail | fail | fail | fail | pass | pass | pass | fail |
| dealQuery | pass | fail | pass | pass | fail | pass | fail | fail | fail | fail |
| dealMutation | pass | fail | fail | fail | fail | fail | fail | fail | fail | fail |
| ledgerQuery | pass | fail | pass | pass | fail | fail | fail | fail | fail | fail |

`pass*` = FairLend admin has `broker:access` and `lawyer:access` in their permissions.

**Important: EXTERNAL_ORG_ADMIN does NOT have broker:access, lender:access, etc.** External org admins only have admin role scoped to their org. For the test, EXTERNAL_ORG_ADMIN identity should have only admin-level permissions for org management, NOT platform-wide permissions.

Actually, looking at the ROLE_PERMISSIONS table: `admin` role includes `broker:access`, `lawyer:access`, `underwriter:access`, etc. This is the FairLend Staff admin permission set. External org admins would have a DIFFERENT permission set in WorkOS (scoped to org management only).

For testing purposes:
- `FAIRLEND_ADMIN` — uses the full `admin` permission set from ROLE_PERMISSIONS
- `EXTERNAL_ORG_ADMIN` — should have a LIMITED permission set (e.g., `org:manage_members`, `org:manage_settings`, `admin:access`). The middleware chain for `brokerQuery` requires `broker:access` which external admin does NOT have.

### Test structure:
```typescript
const CHAIN_TESTS = [
  {
    name: "authedQuery",
    endpoint: api.test.authTestEndpoints.testAuthedQuery,
    type: "query" as const,
    allowed: [FAIRLEND_ADMIN, EXTERNAL_ORG_ADMIN, BROKER, LENDER, BORROWER, LAWYER, JR_UNDERWRITER, UNDERWRITER, SR_UNDERWRITER, MEMBER],
    denied: [],
  },
  {
    name: "adminQuery",
    endpoint: api.test.authTestEndpoints.testAdminQuery,
    type: "query" as const,
    allowed: [FAIRLEND_ADMIN],
    denied: [EXTERNAL_ORG_ADMIN, BROKER, LENDER, BORROWER, LAWYER, JR_UNDERWRITER, UNDERWRITER, SR_UNDERWRITER, MEMBER],
  },
  // ... etc
];
```

## T-012: role-permission-matrix.test.ts

### Systematic verification of the role→permission truth table.

Use `describe.each` over `ROLE_PERMISSIONS` entries:
```typescript
import { ROLE_PERMISSIONS } from "../permissions";

const ALL_PERMISSIONS = [...new Set(Object.values(ROLE_PERMISSIONS).flat())];

describe.each(Object.entries(ROLE_PERMISSIONS))("Role: %s", (role, expectedPermissions) => {
  it("has all expected permissions", () => {
    const actualPermissions = lookupPermissions([role]);
    expect(new Set(actualPermissions)).toEqual(new Set(expectedPermissions));
  });

  it("does not have permissions exclusively belonging to other roles", () => {
    const actualPermissions = lookupPermissions([role]);
    const unexpectedPermissions = ALL_PERMISSIONS.filter(p => !expectedPermissions.includes(p));
    for (const perm of unexpectedPermissions) {
      expect(actualPermissions).not.toContain(perm);
    }
  });
});
```

### Also verify the underwriter hierarchy specifically:

| Permission | jr_underwriter | underwriter | sr_underwriter |
|-----------|---------------|-------------|----------------|
| underwriting:view_queue | yes | yes | yes |
| underwriting:claim | yes | yes | yes |
| underwriting:release | yes | yes | yes |
| underwriting:recommend | **yes** | no | no |
| underwriting:decide | no | **yes** | **yes** |
| underwriting:review_decisions | no | **yes** | **yes** |
| underwriting:review_samples | no | no | **yes** |
| underwriting:reassign | no | no | **yes** |
| underwriting:configure_queue | no | no | **yes** |
| underwriting:view_all | no | no | **yes** |
| underwriting:view_team_metrics | no | **yes** | **yes** |

## T-013: new-permissions.test.ts

### Specific tests for the 7 new permissions added in ENG-9 scope.

Use convex-test to verify that endpoints requiring these permissions grant/deny correctly.

| Permission | Allowed Roles | Denied Roles |
|-----------|--------------|--------------|
| `deal:view` | admin, broker, lender, lawyer | borrower, jr_uw, uw, sr_uw, member |
| `deal:manage` | admin only | broker, lender, lawyer, borrower, all uw, member |
| `ledger:view` | admin, broker, lender | borrower, lawyer, all uw, member |
| `ledger:correct` | admin only | broker, lender, borrower, lawyer, all uw, member |
| `accrual:view` | admin, broker, lender | borrower, lawyer, all uw, member |
| `dispersal:view` | admin, lender | broker, borrower, lawyer, all uw, member |
| `obligation:waive` | admin only | broker, lender, borrower, lawyer, all uw, member |

For permissions without dedicated chain endpoints (like `accrual:view`, `dispersal:view`, `obligation:waive`, `ledger:correct`), test against the `ROLE_PERMISSIONS` truth table directly — verify the identity fixture has/doesn't have the permission.

## T-014: Deprecated Role Validation

Add tests verifying zero references to removed roles in the truth table and fixtures:
```typescript
describe("no references to deprecated roles", () => {
  it("ROLE_PERMISSIONS has no 'investor' key", () => {
    expect(ROLE_PERMISSIONS).not.toHaveProperty("investor");
  });
  it("ROLE_PERMISSIONS has no 'platform_admin' key", () => {
    expect(ROLE_PERMISSIONS).not.toHaveProperty("platform_admin");
  });
  it("ROLE_PERMISSIONS has no 'org_admin' key", () => {
    expect(ROLE_PERMISSIONS).not.toHaveProperty("org_admin");
  });
  it("ROLE_PERMISSIONS has no 'uw_manager' key", () => {
    expect(ROLE_PERMISSIONS).not.toHaveProperty("uw_manager");
  });
});
```
