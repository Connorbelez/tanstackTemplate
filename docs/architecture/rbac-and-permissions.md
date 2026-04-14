# FairLend RBAC And Permissions

> Status note (2026-04-13): this is the canonical RBAC policy for FairLend. It defines the target WorkOS configuration and the intended runtime semantics. Code and tests are being reconciled to this document in a docs-first, red/green enforcement pass.

## Core Rules

- WorkOS AuthKit is the canonical source of truth for roles and permissions.
- `member` is the default WorkOS role.
- `admin` gets exactly one WorkOS permission: `admin:access`.
- `admin:access` is the admin super-permission. Any user holding it should pass permission checks such as `requirePermission(...)` and `guardPermission(...)`.
- `admin:access` does not replace explicit FairLend staff boundary checks. Staff-only surfaces should still use `requireFairLendAdmin`, `adminQuery`, or equivalent org-aware guards where the distinction matters.
- Non-admin roles keep explicit least-privilege permissions. Do not duplicate their entire permission sets onto `admin`.

## WorkOS Role Assignments

### `admin`

- `admin:access`

### `broker`

- `broker:access`
- `onboarding:access`
- `application:create`
- `offer:create`
- `offer:manage`
- `condition:submit`
- `mortgage:service`
- `document:upload`
- `deal:view`
- `ledger:view`
- `accrual:view`
- `listing:create`
- `listing:manage`
- `listing:view`
- `renewal:acknowledge`

### `lender`

- `lender:access`
- `onboarding:access`
- `deal:view`
- `ledger:view`
- `accrual:view`
- `dispersal:view`
- `listing:view`
- `listing:invest`
- `portfolio:view`
- `portfolio:signal_renewal`
- `portfolio:export_tax`

### `borrower`

- `borrower:access`
- `onboarding:access`
- `condition:submit`
- `mortgage:view_own`
- `payment:view_own`
- `payment:reschedule_own`
- `document:upload`
- `document:sign`
- `renewal:signal`

### `lawyer`

- `lawyer:access`
- `onboarding:access`
- `deal:view`

### `jr_underwriter`

- `underwriter:access`
- `application:review`
- `underwriting:view_queue`
- `underwriting:claim`
- `underwriting:release`
- `underwriting:recommend`
- `condition:review`
- `document:review`

### `underwriter`

- `underwriter:access`
- `application:review`
- `underwriting:view_queue`
- `underwriting:claim`
- `underwriting:release`
- `underwriting:decide`
- `underwriting:review_decisions`
- `underwriting:view_team_metrics`
- `condition:review`
- `document:review`

### `sr_underwriter`

- `underwriter:access`
- `application:review`
- `underwriting:view_queue`
- `underwriting:claim`
- `underwriting:release`
- `underwriting:decide`
- `underwriting:review_decisions`
- `underwriting:review_samples`
- `underwriting:reassign`
- `underwriting:configure_queue`
- `underwriting:view_all`
- `underwriting:view_team_metrics`
- `condition:review`
- `document:review`

### `member`

- `onboarding:access`

## Additional WorkOS Permissions To Provision

These permissions should exist in the WorkOS environment even if no non-admin role receives them yet. The point is to keep the WorkOS permission catalog aligned with the codebase while the enforcement pass is underway.

- `payment:view`
- `payment:manage`
- `payment:retry`
- `payment:cancel`
- `payment:webhook_process`
- `cash_ledger:view`
- `cash_ledger:correct`
- `document:generate`
- `obligation:waive`
- `org:manage_members`
- `org:manage_settings`
- `platform:manage_users`
- `platform:manage_orgs`
- `platform:manage_roles`
- `platform:view_audit`
- `platform:manage_system`
- `role:assign`
- `application:triage`
- `application:manage`
- `condition:waive`
- `mortgage:originate`
- `renewal:manage`
- `deal:manage`
- `ledger:correct`

## Runtime Permissions Pending Disposition

These permissions are referenced in repo analysis, but they are not yet approved as canonical WorkOS permissions. Keep them out of the final role matrix until the enforcement pass decides whether they are real product permissions or dead drift.

- `documents:sensitive_access`
- `mortgage:transition`
- `obligation:manage`
- `onboarding:manage`

## Delivery Sequence

1. Align docs to this target policy.
2. Update runtime permission helpers so `admin:access` short-circuits permission checks without weakening explicit FairLend staff org guards.
3. Reconcile tests to the target matrix and intentionally observe red failures where newly enforced permissions are not yet represented correctly.
4. Green the suite by finishing runtime enforcement and aligning mock identities, helper matrices, and WorkOS setup.

## Canonical References

- Runtime role matrix today: [src/test/auth/permissions.ts](../../src/test/auth/permissions.ts)
- Frontend route auth helpers: [src/lib/auth.ts](../../src/lib/auth.ts)
- Backend auth chains: [convex/fluent.ts](../../convex/fluent.ts)
