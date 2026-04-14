# RBAC Permission Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge FairLend's permission model across the original design docs, Linear `ENG-1`, the current WorkOS permission set, repo-side role fixtures, UI metadata, and runtime enforcement so there is one canonical RBAC catalog and no hidden or orphan permissions.

**Architecture:** Freeze the current state in a concrete permission matrix, promote one repo-native source of truth for permissions and role assignments, then refactor enforcement sites and WorkOS/dashboard configuration to match it. Treat this as one project with two tightly-coupled tracks: catalog reconciliation first, authorization hardening second.

**Tech Stack:** WorkOS AuthKit, Convex, fluent-convex, TanStack Start, React, Vitest, Bun, GitNexus

---

## Scope And Assumptions

- Baseline sources:
  - Notion A: `RBAC & Authentication Foundation — Technical Design`
  - Notion B: `Authorization & Access Control`
  - Linear: `ENG-1 Configure WorkOS Custom Claims template and role definitions`
  - Current WorkOS permission set supplied by the user in-thread
  - Repo role matrix: `src/test/auth/permissions.ts`
  - Repo UI metadata: `src/lib/rbac-display-metadata.ts`
  - Runtime permission checks located via `requirePermission(...)`, `requirePermissionAction(...)`, `guardPermission(...)`, `guardAnyPermission(...)`, and `viewer.permissions.has(...)`
- Notion public HTML did not expose the page bodies cleanly to a mechanical fetch. The `Notion A` and `Notion B` columns below therefore reflect the reviewed original design baseline as captured from those docs and cross-checked against `ENG-1`.
- `Enforced` means an active runtime permission gate was located. A `N` in that column means “no explicit current runtime gate located,” not necessarily “permission is completely unused everywhere.”
- `Role Matrix` means “present in `src/test/auth/permissions.ts`.”
- `Metadata` means “present in `src/lib/rbac-display-metadata.ts`.”
- Updated policy decision from the user:
  - `admin:access` is the god permission.
  - If a user has `admin:access`, all permission checks resolve successfully.
  - This must be modeled explicitly in the canonical catalog, middleware tests, documentation, and WorkOS role assignment policy.
  - Because this collapses least-privilege checks for any principal holding `admin:access`, the final plan must also document which roles are allowed to receive `admin:access`.

## Drift Snapshot

- Total permission union across all reviewed surfaces: `73`
- Fully aligned permissions: `23`
- Runtime-enforced but not provisioned in WorkOS: `4`
  - `documents:sensitive_access`
  - `mortgage:transition`
  - `obligation:manage`
  - `payment:view`
- Present in WorkOS but not represented in tests or UI metadata: `3`
  - `payment:cancel`
  - `payment:retry`
  - `payment:webhook_process`
- Metadata-only orphan: `1`
  - `onboarding:manage`
- Runtime permissions absent from the original design baseline but now modeled elsewhere: `2`
  - `cash_ledger:view`
  - `cash_ledger:correct`

## Source Surfaces

- Notion A: [RBAC & Authentication Foundation — Technical Design](https://www.notion.so/322fc1b44024811cbccad22752327a08)
- Notion B: [Authorization & Access Control](https://www.notion.so/321fc1b440248127a3bef2ea0371aaf6)
- Linear: [ENG-1 Configure WorkOS Custom Claims template and role definitions](https://linear.app/fairlend/issue/ENG-1/configure-workos-custom-claims-template-and-role-definitions)
- WorkOS set: current in-thread permission list
- Repo files:
  - `convex/fluent.ts`
  - `convex/auth/resourceChecks.ts`
  - `convex/engine/commands.ts`
  - `convex/onboarding/mutations.ts`
  - `convex/onboarding/queries.ts`
  - `convex/payments/transfers/queries.ts`
  - `convex/payments/cashLedger/queries.ts`
  - `convex/payments/bankAccounts/queries.ts`
  - `src/lib/auth.ts`
  - `src/lib/rbac-display-metadata.ts`
  - `src/test/auth/permissions.ts`
  - `src/test/auth/chains/role-chains.test.ts`

## Role-To-Permission Baseline

This section records the current repo-side role matrix from `src/test/auth/permissions.ts`, with the user-provided update that `admin:access` acts as a global override. These assignments should be moved into the canonical catalog during implementation.

### Superuser Rule

- `admin:access` is not just an island-access permission.
- `admin:access` is the superuser override: any `requirePermission(...)` check should pass when the caller has `admin:access`.
- The catalog and tests must distinguish between:
  - direct role-granted permissions
  - effective permissions after applying the `admin:access` override
- Because of that override, any role granted `admin:access` is effectively god-mode unless there is a second structural gate such as `requireFairLendAdmin`.

### Current Roles

- `admin`
  - Directly assigned in repo tests: `admin:access`, `broker:access`, `underwriter:access`, `lawyer:access`, `onboarding:access`, `onboarding:review`, `role:assign`, `application:create`, `application:triage`, `application:review`, `application:manage`, `underwriting:view_queue`, `underwriting:reassign`, `underwriting:configure_queue`, `underwriting:view_all`, `underwriting:view_team_metrics`, `offer:create`, `offer:manage`, `condition:review`, `condition:waive`, `mortgage:originate`, `mortgage:service`, `payment:view`, `payment:manage`, `cash_ledger:view`, `cash_ledger:correct`, `document:upload`, `document:review`, `document:generate`, `deal:view`, `deal:manage`, `ledger:view`, `ledger:correct`, `accrual:view`, `dispersal:view`, `listing:create`, `listing:manage`, `renewal:acknowledge`, `renewal:manage`, `org:manage_members`, `org:manage_settings`, `platform:manage_users`, `platform:manage_orgs`, `platform:manage_roles`, `platform:view_audit`, `platform:manage_system`, `obligation:waive`
  - Effective access rule: all permission checks pass because this role includes `admin:access`

- `broker`
  - `broker:access`, `onboarding:access`, `application:create`, `offer:create`, `offer:manage`, `condition:submit`, `mortgage:service`, `document:upload`, `deal:view`, `ledger:view`, `accrual:view`, `listing:create`, `listing:manage`, `listing:view`, `renewal:acknowledge`

- `lender`
  - `lender:access`, `onboarding:access`, `deal:view`, `ledger:view`, `accrual:view`, `dispersal:view`, `listing:view`, `listing:invest`, `portfolio:view`, `portfolio:signal_renewal`, `portfolio:export_tax`

- `borrower`
  - `borrower:access`, `onboarding:access`, `condition:submit`, `mortgage:view_own`, `payment:view_own`, `payment:reschedule_own`, `document:upload`, `document:sign`, `renewal:signal`

- `lawyer`
  - `lawyer:access`, `onboarding:access`, `deal:view`

- `jr_underwriter`
  - `underwriter:access`, `application:review`, `underwriting:view_queue`, `underwriting:claim`, `underwriting:release`, `underwriting:recommend`, `condition:review`, `document:review`

- `underwriter`
  - `underwriter:access`, `application:review`, `underwriting:view_queue`, `underwriting:claim`, `underwriting:release`, `underwriting:decide`, `underwriting:review_decisions`, `underwriting:view_team_metrics`, `condition:review`, `document:review`

- `sr_underwriter`
  - `underwriter:access`, `application:review`, `underwriting:view_queue`, `underwriting:claim`, `underwriting:release`, `underwriting:decide`, `underwriting:review_decisions`, `underwriting:review_samples`, `underwriting:reassign`, `underwriting:configure_queue`, `underwriting:view_all`, `underwriting:view_team_metrics`, `condition:review`, `document:review`

- `member`
  - `onboarding:access`

- `external org admin`
  - Current test fixture special case: `admin:access`, `org:manage_members`, `org:manage_settings`
  - Important implication under the updated policy: if `admin:access` is truly global, this fixture becomes effectively god-mode for permission checks unless protected by a structural gate like `requireFairLendAdmin`

## Comprehensive Permission Matrix

Legend:

- `Y` = present in that surface
- `N` = absent from that surface
- `Gap Surfaces` = where the permission is missing today

| Permission | Domain | Notion A | Notion B | ENG-1 | WorkOS | Role Matrix | Metadata | Enforced | Gap Surfaces | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| accrual:view | accrual | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| admin:access | admin | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| application:create | application | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| application:manage | application | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| application:review | application | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| application:triage | application | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| borrower:access | borrower | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| broker:access | broker | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| cash_ledger:correct | cash_ledger | N | N | N | Y | Y | Y | Y | Notion A, Notion B, ENG-1 | Runtime permission missing from original design baseline |
| cash_ledger:view | cash_ledger | N | N | N | Y | Y | Y | Y | Notion A, Notion B, ENG-1 | Runtime permission missing from original design baseline |
| condition:review | condition | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| condition:submit | condition | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| condition:waive | condition | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| deal:manage | deal | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| deal:view | deal | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| dispersal:view | dispersal | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| document:generate | document | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| document:review | document | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| document:sign | document | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| document:upload | document | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| documents:sensitive_access | documents | N | N | N | N | N | N | Y | Notion A, Notion B, ENG-1, WorkOS, role matrix, metadata | Enforced in runtime but not modeled anywhere else; likely hidden/orphan permission |
| lawyer:access | lawyer | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| ledger:correct | ledger | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| ledger:view | ledger | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| lender:access | lender | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| listing:create | listing | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| listing:invest | listing | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| listing:manage | listing | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| listing:view | listing | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| mortgage:originate | mortgage | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| mortgage:service | mortgage | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| mortgage:transition | mortgage | N | N | N | N | N | N | Y | Notion A, Notion B, ENG-1, WorkOS, role matrix, metadata | Enforced in runtime but not provisioned in WorkOS or documented |
| mortgage:view_own | mortgage | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| obligation:manage | obligation | N | N | N | N | N | N | Y | Notion A, Notion B, ENG-1, WorkOS, role matrix, metadata | Enforced in runtime but not provisioned in WorkOS or documented |
| obligation:waive | obligation | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| offer:create | offer | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| offer:manage | offer | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| onboarding:access | onboarding | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| onboarding:manage | onboarding | Y | Y | Y | Y | N | Y | N | role matrix, enforcement | Metadata-only orphan; decide whether to promote or delete |
| onboarding:review | onboarding | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| org:manage_members | org | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| org:manage_settings | org | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| payment:cancel | payment | N | N | N | Y | N | N | Y | Notion A, Notion B, ENG-1, role matrix, metadata | Provisioned in WorkOS and enforced in runtime, but missing from tests and UI metadata |
| payment:manage | payment | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| payment:reschedule_own | payment | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| payment:retry | payment | N | N | N | Y | N | N | Y | Notion A, Notion B, ENG-1, role matrix, metadata | Provisioned in WorkOS and enforced in runtime, but missing from tests and UI metadata |
| payment:view | payment | N | N | N | N | Y | Y | Y | Notion A, Notion B, ENG-1, WorkOS | Enforced in runtime and represented in repo, but missing from WorkOS and the original design baseline |
| payment:view_own | payment | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| payment:webhook_process | payment | N | N | N | Y | N | N | Y | Notion A, Notion B, ENG-1, role matrix, metadata | Provisioned in WorkOS and enforced in runtime, but missing from tests and UI metadata |
| platform:manage_orgs | platform | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| platform:manage_roles | platform | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| platform:manage_system | platform | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| platform:manage_users | platform | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| platform:view_audit | platform | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| portfolio:export_tax | portfolio | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| portfolio:signal_renewal | portfolio | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| portfolio:view | portfolio | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| renewal:acknowledge | renewal | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| renewal:manage | renewal | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| renewal:signal | renewal | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| role:assign | role | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| underwriter:access | underwriter | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| underwriting:claim | underwriting | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| underwriting:configure_queue | underwriting | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| underwriting:decide | underwriting | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| underwriting:reassign | underwriting | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| underwriting:recommend | underwriting | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| underwriting:release | underwriting | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| underwriting:review_decisions | underwriting | Y | Y | Y | Y | Y | Y | Y | None | Aligned |
| underwriting:review_samples | underwriting | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| underwriting:view_all | underwriting | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| underwriting:view_queue | underwriting | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |
| underwriting:view_team_metrics | underwriting | Y | Y | Y | Y | Y | Y | N | enforcement | Declared but no current explicit runtime guard located |

## Proposed Target State

1. The repo owns one canonical permission registry.
   - Create a shared catalog module that defines permission ids, display metadata, role assignments, and any flags needed for WorkOS export.
   - Everything else derives from that file: test fixtures, display metadata, docs export, and drift tests.
   - The catalog must also encode the `admin:access` superuser override explicitly instead of leaving it implicit in middleware.

2. `admin:access` is modeled as the global superuser override.
   - Any permission check resolves successfully when the caller has `admin:access`.
   - All auth tests must verify both direct permission assignment and effective-permission behavior under the override.
   - Structural guards such as `requireFairLendAdmin` remain necessary where the boundary is “FairLend staff only” rather than “has any permission.”

3. Runtime-only permissions must be normalized immediately.
   - Promote and document if legitimate:
     - `payment:view`
     - `cash_ledger:view`
     - `cash_ledger:correct`
     - `payment:retry`
     - `payment:cancel`
     - `payment:webhook_process`
   - Resolve or delete if accidental/orphaned:
     - `documents:sensitive_access`
     - `mortgage:transition`
     - `obligation:manage`
     - `onboarding:manage`

4. WorkOS must match the repo catalog exactly.
   - No permission may exist only in code.
   - No permission may exist only in WorkOS.
   - No permission may exist only in metadata/tests.
   - No role should receive `admin:access` accidentally, because that now implies universal permission success.

5. Sensitive read surfaces must pair coarse permissions with resource ownership checks.
   - Payment and cash-ledger reads cannot stop at `payment:view` or `cash_ledger:view`.
   - Onboarding request flows must either require `onboarding:access` or explicitly deprecate that permission.

## Preflight GitNexus Checks

Run these before touching any existing symbol:

- `gitnexus_impact({ target: "paymentQuery", direction: "upstream", repo: "fairlendapp" })`
- `gitnexus_impact({ target: "cashLedgerQuery", direction: "upstream", repo: "fairlendapp" })`
- `gitnexus_impact({ target: "canAccessDocument", direction: "upstream", repo: "fairlendapp" })`
- `gitnexus_impact({ target: "transitionMortgage", direction: "upstream", repo: "fairlendapp" })`
- `gitnexus_impact({ target: "confirmObligationPayment", direction: "upstream", repo: "fairlendapp" })`
- `gitnexus_impact({ target: "requestRole", direction: "upstream", repo: "fairlendapp" })`
- `gitnexus_impact({ target: "getMyOnboardingRequest", direction: "upstream", repo: "fairlendapp" })`

If any of those return `HIGH` or `CRITICAL`, stop and narrow the write plan before editing.

## File Structure

### New Canonical Files

- Create: `convex/auth/permissionCatalog.ts`
  - Canonical permission ids
  - Role-to-permission assignments
  - Optional WorkOS export metadata
  - Drift helper exports for tests/docs
- Create: `src/test/auth/permissions/catalog-sync.test.ts`
  - Ensures every runtime-enforced permission exists in the canonical catalog
  - Ensures every WorkOS-exported permission exists in the canonical catalog

### Existing Files To Refactor Around The Catalog

- Modify: `src/test/auth/permissions.ts`
- Modify: `src/lib/rbac-display-metadata.ts`
- Modify: `src/test/auth/permissions/permission-metadata-sync.test.ts`
- Modify: `src/test/auth/chains/role-chains.test.ts`
- Modify: `src/test/auth/identities.ts`
- Modify: `convex/fluent.ts`
- Modify: `convex/auth/resourceChecks.ts`
- Modify: `convex/engine/commands.ts`
- Modify: `convex/onboarding/mutations.ts`
- Modify: `convex/onboarding/queries.ts`
- Modify: `convex/payments/transfers/queries.ts`
- Modify: `convex/payments/cashLedger/queries.ts`
- Modify: `convex/payments/bankAccounts/queries.ts`

### Docs / Operational Surfaces

- Update: Notion A
- Update: Notion B
- Update: Linear `ENG-1` or create a follow-up issue that supersedes its permission list
- Update: WorkOS roles/permissions in dashboard

## Task 1: Freeze The Canonical Catalog

**Files:**

- Create: `convex/auth/permissionCatalog.ts`
- Modify: `src/test/auth/permissions.ts`
- Modify: `src/lib/rbac-display-metadata.ts`
- Test: `src/test/auth/permissions/catalog-sync.test.ts`
- Test: `src/test/auth/permissions/permission-metadata-sync.test.ts`

- [ ] **Step 1: Create the canonical catalog module**

Create `convex/auth/permissionCatalog.ts` with one explicit source of truth for:

```ts
export const PERMISSION_CATALOG = {
  "admin:access": { domain: "admin", workos: true, grantsAllPermissions: true },
  "payment:view": { domain: "payment", workos: true },
  // ...
} as const;

export const ROLE_PERMISSIONS = {
  admin: ["admin:access", "payment:view", "payment:manage"],
  borrower: ["borrower:access", "payment:view_own"],
  // ...
} as const;

export const PERMISSION_DISPLAY_METADATA = {
  "admin:access": {
    name: "Admin Access",
    description: "Access admin routes",
    domain: "admin",
  },
  // ...
} as const;
```

- [ ] **Step 2: Refactor test fixtures and UI metadata to derive from the catalog**

Replace duplicated literals in:

- `src/test/auth/permissions.ts`
- `src/lib/rbac-display-metadata.ts`

with imports from the canonical catalog instead of maintaining separate lists.

- [ ] **Step 3: Add drift tests**

Add tests that fail if:

- a runtime-enforced permission is missing from the catalog
- a WorkOS-exported permission is missing from the catalog
- a role permission is missing display metadata
- metadata exists for a permission that is neither assigned nor intentionally orphaned
- the `admin:access` override behavior is not reflected in effective-permission helpers and middleware tests

- [ ] **Step 4: Run the focused test set**

Run:

```bash
bun run vitest src/test/auth/permissions/catalog-sync.test.ts src/test/auth/permissions/permission-metadata-sync.test.ts
```

Expected: all permission-catalog sync checks pass.

- [ ] **Step 5: Record the change**

```bash
gt create -am "refactor: add canonical RBAC permission catalog"
```

## Task 2: Resolve Catalog Decisions For Drifted Permissions

**Files:**

- Modify: `convex/auth/permissionCatalog.ts`
- Modify: Notion A
- Modify: Notion B
- Modify: Linear `ENG-1` or create a follow-up implementation issue
- Modify: WorkOS dashboard

- [ ] **Step 1: Classify each drifted permission explicitly**

Use this decision table:

- Keep and document:
  - `payment:view`
  - `cash_ledger:view`
  - `cash_ledger:correct`
  - `payment:retry`
  - `payment:cancel`
  - `payment:webhook_process`
- Decision required:
  - `documents:sensitive_access`
  - `mortgage:transition`
  - `obligation:manage`
  - `onboarding:manage`

- [ ] **Step 2: Normalize naming and ownership**

Recommended default decisions unless product/security overrides them:

- Rename `documents:sensitive_access` to `document:sensitive_access` if retained, to stay consistent with the existing singular `document:*` namespace.
- Replace `mortgage:transition` with a domain permission that reflects who may transition mortgages, or move the public mutation behind a more specific existing permission such as `mortgage:service` if that matches the intended policy.
- Replace `obligation:manage` with a modeled permission in the obligation/payment domain, or remove the public gate if the operation should be internal-only.
- Either assign `onboarding:manage` to a real role and enforce it, or delete it from metadata.

- [ ] **Step 3: Update the canonical catalog and WorkOS export list**

After decisions are approved, update:

- `convex/auth/permissionCatalog.ts`
- WorkOS dashboard roles/permissions
- the matrix in this plan if scope changes during implementation

- [ ] **Step 4: Capture the operational change**

Add a short implementation note or follow-up Linear issue documenting:

- which permissions were added to WorkOS
- which permissions were removed or renamed
- which docs/issues were superseded

- [ ] **Step 5: Record the change**

```bash
gt modify -am "chore: reconcile modeled RBAC permissions"
```

## Task 3: Align Runtime Enforcement With The Catalog

**Files:**

- Modify: `convex/fluent.ts`
- Modify: `convex/engine/commands.ts`
- Modify: `convex/onboarding/mutations.ts`
- Modify: `convex/onboarding/queries.ts`
- Test: `src/test/auth/middleware/requirePermission.test.ts`
- Test: `src/test/auth/integration/onboarding-auth.test.ts`

- [ ] **Step 1: Replace raw string literals with catalog-backed permission ids**

Use imported constants from `convex/auth/permissionCatalog.ts` anywhere a permission gate is currently spelled inline in:

- `convex/fluent.ts`
- `convex/engine/commands.ts`
- onboarding modules

- [ ] **Step 2: Fix onboarding consistency**

Choose one clear model and implement it:

- `requestRole` and `getMyOnboardingRequest` require `onboarding:access`, or
- `onboarding:access` is removed from the modeled permission set

Do not leave “present in catalog but unused in runtime” ambiguity.

- [ ] **Step 3: Resolve engine command permissions**

Update `transitionMortgage` and `confirmObligationPayment` so they use only modeled permissions that exist in:

- Notion docs
- WorkOS
- canonical catalog
- tests

- [ ] **Step 4: Run focused auth tests**

Run:

```bash
bun run vitest src/test/auth/middleware/requirePermission.test.ts src/test/auth/integration/onboarding-auth.test.ts src/test/auth/chains/role-chains.test.ts
```

Expected: middleware and chain tests pass with no orphan permission literals left behind.

- [ ] **Step 5: Record the change**

```bash
gt modify -am "refactor: align runtime permission enforcement"
```

## Task 4: Close Payment And Cash-Ledger Authorization Gaps

**Files:**

- Modify: `convex/payments/transfers/queries.ts`
- Modify: `convex/payments/cashLedger/queries.ts`
- Modify: `convex/payments/bankAccounts/queries.ts`
- Modify: `convex/auth/resourceChecks.ts`
- Test: `src/test/auth/integration/resource-ownership.test.ts`
- Test: add payment/cash-ledger auth coverage where missing

- [ ] **Step 1: Introduce resource-aware helpers for payment reads**

Add or extend helpers so payment surfaces can assert access by:

- mortgage ownership
- deal access
- borrower/lender linkage
- closing-team assignment where relevant

- [ ] **Step 2: Apply the helpers to every public payment read**

Update payment and cash-ledger queries so they do not rely only on:

- `payment:view`
- `cash_ledger:view`

Each public read must also check whether the caller may see that specific resource.

- [ ] **Step 3: Separate staff-global reads from self-service reads**

Recommended default:

- `payment:view` and `cash_ledger:*` reserved for FairLend staff/admin-only operational surfaces
- `payment:view_own` used for borrower/lender self-service reads, always paired with resource checks

- [ ] **Step 4: Add regression tests**

Cover at least:

- staff admin can read global payment/cash-ledger data
- borrower/lender can only read owned resources
- guessed IDs for another org/resource are rejected

- [ ] **Step 5: Run focused backend verification**

Run:

```bash
bun run vitest src/test/auth/integration/resource-ownership.test.ts
```

If new payment/cash-ledger tests are added, run them in the same command.

- [ ] **Step 6: Record the change**

```bash
gt modify -am "fix: add resource-aware payment authorization"
```

## Task 5: Reconcile Docs And WorkOS Operationally

**Files:**

- Modify: Notion A
- Modify: Notion B
- Modify: Linear `ENG-1` or a superseding issue
- Modify: WorkOS dashboard

- [ ] **Step 1: Publish the final permission catalog**

Update the docs so the catalog includes every kept permission and excludes every removed permission.

- [ ] **Step 2: Make `ENG-1` historical instead of misleading**

Either:

- edit `ENG-1` to note it is the original baseline and link the superseding catalog, or
- create a new issue that supersedes `ENG-1` and explicitly references the final catalog module

- [ ] **Step 3: Apply WorkOS changes**

In WorkOS:

- add any kept permissions missing from the dashboard
- remove or rename deprecated permissions
- verify roles produce the expected custom claims payload

- [ ] **Step 4: Validate a real JWT sample**

Test at least:

- FairLend admin
- external org admin
- broker
- borrower
- lender

Confirm the JWT claims contain the expected `roles` and `permissions` after the catalog change.

- [ ] **Step 5: Record the change**

```bash
gt modify -am "docs: reconcile RBAC design and WorkOS catalog"
```

## Task 6: Run End-To-End Verification And Review

**Files:**

- No new production files expected
- Verify all files touched in Tasks 1-5

- [ ] **Step 1: Run required repo-wide verification**

Run:

```bash
bun check
bun typecheck
bunx convex codegen
```

Expected: all three pass cleanly.

- [ ] **Step 2: Run focused auth and authorization tests**

Run:

```bash
bun run vitest src/test/auth
```

Expected: auth suite passes with updated catalog and enforcement behavior.

- [ ] **Step 3: Run code review tooling after the major unit of work**

Run:

```bash
coderabbit review --plain
```

Expected: no critical RBAC regression findings remain open.

- [ ] **Step 4: Verify scope before commit**

Run GitNexus:

- `gitnexus_detect_changes({ scope: "all", repo: "fairlendapp" })`

Expected: only RBAC catalog, auth enforcement, payment/cash-ledger authorization, and supporting test/doc files appear in the affected scope.

- [ ] **Step 5: Record the final integration change**

```bash
gt submit
```

## Self-Review Checklist

- Every runtime-enforced permission appears in the canonical catalog.
- Every WorkOS permission appears in the canonical catalog.
- No metadata-only or test-only permission remains without an intentional justification.
- No public payment or cash-ledger read path relies only on coarse permissions.
- `ENG-1`, Notion A, Notion B, WorkOS, repo catalog, and runtime enforcement all agree on the final kept permission set.

Plan complete and saved to `docs/superpowers/plans/2026-04-11-rbac-permission-reconciliation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
