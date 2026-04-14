# Security And RBAC Review

> Status note (2026-04-13): this is a point-in-time review snapshot, not the canonical RBAC policy. The live target policy now lives in [docs/architecture/rbac-and-permissions.md](../architecture/rbac-and-permissions.md), including the newer rule that `admin:access` is the admin super-permission while explicit FairLend staff boundary checks remain separate.

## Worktree Context

- Repository: `/Users/connor/Dev/tanstackFairLend/fairlendapp`
- Branch: `04-04-active_mortgage_payment_system_08-15`
- Reviewed HEAD: `8f77a4d9e`
- Worktree status: dirty; live files were treated as authoritative
- Mandatory evidence run: `bun run lint:security --quiet`
- Lint result: failed with a large number of findings. Manual validation confirmed that many `require-auth-gate` hits are false positives caused by custom fluent-convex chains such as `paymentQuery`, `paymentMutation`, `paymentAction`, `crmAdminMutation`, and `adminQuery`. Examples of validated false positives include:
  - `convex/payments/transfers/mutations.ts:130-340`
  - `convex/payments/collectionPlan/workout.ts:1048-1319`
  - `convex/payments/collectionPlan/admin.ts:530-840`
- The report below focuses on production-significant issues after that manual validation, and distinguishes demo-only/frontend parity issues from backend authorization flaws.

## Executive Summary

The core auth foundation is mostly sound: `convex/fluent.ts` builds `viewer` from WorkOS JWT/session claims, `requireFairLendAdmin` correctly distinguishes FairLend staff admin from a generic org admin, and route-root auth loading in `src/routes/__root.tsx` uses `getAuth()` rather than Convex-side auth table lookups. Resource-level helper checks also exist in `convex/auth/resourceChecks.ts` and are already used correctly in accrual endpoints.

The main problems are authorization gaps above that foundation. The highest-risk issues are: the admin shell backend trusts `admin:access` instead of the FairLend staff boundary, payment/cash-ledger read surfaces are coarse-permission-only and skip resource checks, and document-engine surfaces remain auth-only with explicit production TODOs. CRM is better on tenant isolation than the linter suggests, but its data plane is intentionally open to any authenticated org member, which is a least-privilege gap rather than a cross-tenant break.

## Areas Reviewed

- Core auth and RBAC builder chains:
  - `convex/fluent.ts`
  - `convex/auth/resourceChecks.ts`
  - `convex/auth.ts`
  - `src/routes/__root.tsx`
  - `src/lib/auth.ts`
- Admin and underwriting route guards:
  - `src/routes/admin/route.tsx`
  - `src/routes/admin/underwriting/route.tsx`
  - `convex/admin/queries.ts`
- Payment and ledger read surfaces:
  - `convex/payments/transfers/queries.ts` with 8 public query exports
  - `convex/payments/cashLedger/queries.ts` with 19 public query exports
  - `convex/payments/bankAccounts/queries.ts` with 1 public query export
  - Spot-check of new worktree collection-plan surfaces:
    - `convex/payments/collectionPlan/workout.ts`
    - `convex/payments/collectionPlan/admin.ts`
    - `convex/payments/collectionPlan/reschedule.ts`
- Webhooks:
  - `convex/payments/webhooks/verification.ts`
  - `convex/payments/webhooks/stripe.ts`
  - `convex/payments/webhooks/rotessa.ts`
  - `convex/payments/webhooks/rotessaPad.ts`
  - `convex/payments/webhooks/vopay.ts`
  - `convex/payments/webhooks/transferCore.ts`
  - `convex/payments/webhooks/processReversal.ts`
  - `convex/payments/webhooks/handleReversal.ts`
- Document engine:
  - Focused files total 43 public exports across:
    - `convex/documentEngine/basePdfs.ts`
    - `convex/documentEngine/generation.ts`
    - `convex/documentEngine/systemVariables.ts`
    - `convex/documentEngine/templateVersions.ts`
    - `convex/documentEngine/templates.ts`
    - `convex/documentEngine/templateGroups.ts`
    - `convex/documentEngine/dataModelEntities.ts`
- CRM:
  - Focused files total 47 public exports across:
    - `convex/crm/objectDefs.ts`
    - `convex/crm/fieldDefs.ts`
    - `convex/crm/linkTypes.ts`
    - `convex/crm/viewDefs.ts`
    - `convex/crm/viewFields.ts`
    - `convex/crm/viewFilters.ts`
    - `convex/crm/viewKanbanGroups.ts`
    - `convex/crm/records.ts`
    - `convex/crm/recordQueries.ts`
    - `convex/crm/recordLinks.ts`
    - `convex/crm/linkQueries.ts`
    - `convex/crm/activityQueries.ts`
    - `convex/crm/calendarQuery.ts`
    - `convex/crm/viewQueries.ts`
    - `convex/crm/systemAdapters/bootstrap.ts`
- Demo routing:
  - representative review of `src/routes/demo/*`, especially CRM, document-engine, AMPS, RBAC, and generic Convex demo routes

## Areas Not Deeply Reviewed

- Full mutation-by-mutation business logic for all payment transfer and collection-plan write paths outside the focused auth wrapper validation
- Non-focused platform modules flagged by the linter, such as listings, todos, numbers, and unrelated demo modules
- Deployment/runtime controls not visible in repo code, including reverse proxy rules, rate limiting, and CSP/security headers at the edge

## Trust Boundary Summary

- Auth source of truth is mostly correct in backend code. `convex/fluent.ts:60-118` and `307-358` build `viewer` from `auth.getUserIdentity()` claims, not from synced auth tables. `src/routes/__root.tsx:27-48` and `88-99` similarly source UI auth from `getAuth()`.
- The synced WorkOS tables in `convex/auth.ts` are primarily used for replication, demo UX, and domain identity lookup, not for the core permission check path. That is the right direction.
- `convex/auth/resourceChecks.ts:141-242` provides resource-aware checks for mortgages, deals, ledger positions, and accruals. Those helpers are a stronger authorization seam than coarse permission checks alone.
- The main trust-boundary failures come from surfaces that stop at auth-only or permission-only gating and never invoke resource checks.
- Webhook trust boundaries are better in the newer VoPay and Rotessa PAD flows, which verify signatures before parsing, persist verified raw payloads, and use idempotent state checks in `webhookEvents`.

## Severity-Ranked Findings

### F1. High: Admin shell backend trusts `admin:access`, not FairLend staff admin

- Severity: High
- Location:
  - `convex/admin/queries.ts:11-31`
  - `src/routes/admin/route.tsx:11-18`
  - `src/test/auth/identities.ts:26-38`
  - `convex/fluent.ts:102-118`, `401`
- Evidence:
  - `convex/admin/queries.ts:11` defines `adminShellQuery = authedQuery.use(requirePermission("admin:access"))`.
  - `convex/admin/queries.ts:28-30`, `59`, and `70` then perform unrestricted `.collect()` reads across `mortgages`, `properties`, and `deals`.
  - `src/routes/admin/route.tsx:16-18` grants `/admin` access to anyone satisfying `canAccessAdminPath`, which returns true for `admin:access`.
  - `src/test/auth/identities.ts:29-38` explicitly defines an `EXTERNAL_ORG_ADMIN` with `admin:access` that is not a FairLend staff admin.
- Impact:
  - A non-FairLend organization admin can cross the intended staff boundary and enumerate platform-wide admin shell data if granted `admin:access`.
- Why this matters:
  - The codebase already has the correct boundary primitive in `requireFairLendAdmin` / `adminQuery`, but this surface does not use it.
- Remediation:
  - Convert `adminShellQuery` to `adminQuery`, or add an explicit `requireFairLendAdmin` check before any global entity reads.

### F2. High: Payment and cash-ledger read APIs are coarse-permission-only BOLA/IDOR surfaces

- Severity: High
- Location:
  - `convex/fluent.ts:419-439`
  - `convex/payments/transfers/queries.ts:51-299`
  - `convex/payments/bankAccounts/queries.ts:14-66`
  - `convex/payments/cashLedger/queries.ts:67-504`
  - `convex/payments/collectionPlan/workout.ts:1274-1319`
  - `convex/auth/resourceChecks.ts:141-242`
- Evidence:
  - `cashLedgerQuery` and `paymentQuery` only require `cash_ledger:view` or `payment:view` in `convex/fluent.ts:419-425`.
  - `convex/payments/transfers/queries.ts` exposes reads by arbitrary `transferId`, `mortgageId`, `dealId`, `counterpartyId`, `pipelineId`, and status without any call to `canAccessMortgage`, `canAccessDeal`, or org checks.
  - `convex/payments/bankAccounts/queries.ts:14-66` lists bank accounts for any caller-supplied owner tuple and returns institution/transit metadata.
  - `convex/payments/cashLedger/queries.ts` exposes balances and journals by raw `accountId`, `mortgageId`, `borrowerId`, `lenderId`, `obligationId`, and `postingGroupId`.
  - `convex/auth/resourceChecks.ts` already has the resource-aware primitives needed to constrain these reads, but the reviewed payment queries do not use them.
- Impact:
  - Any principal holding one of these broad permissions can fetch another tenant’s transfer history, workout plans, bank account metadata, or cash-ledger balances via guessed IDs or IDs learned elsewhere.
- Why this matters:
  - This is exactly the kind of resource-level authorization gap that turns a permission check into an IDOR.
  - The accrual endpoints show the safer pattern: `convex/accrual/calculateAccruedByMortgage.ts:6-27` and `convex/accrual/calculateInvestorPortfolio.ts:6-27` gate coarse read permissions with resource checks.
- Remediation:
  - Add resource-aware middleware or per-handler assertions for mortgage/deal/lender/borrower ownership before returning payment data.
  - Prefer `payment:view_own` plus resource checks for borrower/lender self-service reads, and reserve global payment reads for FairLend staff-only admin endpoints.

### F3. High: Document engine remains auth-only for sensitive reads and generation flows

- Severity: High
- Location:
  - `convex/documentEngine/basePdfs.ts:9-11`, `25-88`, `113-164`
  - `convex/documentEngine/systemVariables.ts:5-6`, `94-109`
  - `convex/documentEngine/templates.ts:5-6`, `34-52`
  - `convex/documentEngine/templateGroups.ts:4-5`, `25-51`
  - `convex/documentEngine/templateVersions.ts:4-5`, `7-42`
  - `convex/documentEngine/generation.ts:338-457`, `569-644`
  - `src/routes/demo/document-engine/route.tsx:16-19`
  - `src/routes/demo/document-engine/library.tsx:16-22`
- Evidence:
  - The code contains explicit production TODOs stating that these reads are authentication-only today and still need permission gates.
  - `basePdfs.getUrl` at `83-88` returns signed storage URLs from `ctx.storage.getUrl`.
  - `systemVariables.list/getByKey`, `templates.get/list`, `templateGroups.get/list`, and `templateVersions.*` are all `authedQuery`, not permission- or role-gated.
  - `prepareGeneration`, `generateFromTemplate`, and `generateFromGroup` are `authedAction`, again with TODOs for `document:*` permissions.
- Impact:
  - Any signed-in user can enumerate document templates and variables, access signed PDF URLs, and invoke document generation workflows outside intended reviewer/generator roles.
- Why this matters:
  - These are not demo-only backend modules. The TODO comments already acknowledge the exposure.
- Remediation:
  - Introduce explicit `document:view`, `document:generate`, and `document:upload` enforcement on all public document-engine reads and actions before these surfaces are treated as production-ready.

### F4. Medium: CRM data plane is intentionally open to any authenticated org member

- Severity: Medium
- Location:
  - `convex/fluent.ts:458-460`
  - `src/test/auth/chains/role-chains.test.ts:230-239`
  - `convex/crm/records.ts:194-424`
  - `convex/crm/recordQueries.ts:567-893`
  - `convex/crm/linkQueries.ts:71-251`
  - `convex/crm/activityQueries.ts:248-354`
  - `convex/crm/viewQueries.ts:421-648`
- Evidence:
  - `crmQuery` and `crmMutation` only enforce `authed* + requireOrgContext`; they do not require any CRM-specific permission.
  - The auth chain tests explicitly describe these surfaces as allowed for `ALL_IDENTITY_NAMES`.
  - The data-plane handlers do verify `orgId`, so tenant isolation is mostly sound, but there is no in-org least-privilege separation.
- Impact:
  - Any authenticated user with organization context can create, update, delete, search, and link CRM records for that org, even if the UI treats CRM as an admin capability.
- Why this matters:
  - This is not a cross-tenant break, but it is still a privilege-escalation surface inside each org.
- What appears sound:
  - CRM control-plane endpoints such as `objectDefs`, `fieldDefs`, `viewDefs`, and `linkTypes` use `crmAdminQuery` / `crmAdminMutation`, which is a real admin boundary for org-scoped metadata changes.
- Remediation:
  - Add CRM-specific permissions for data-plane read/write operations, or split CRM into viewer/editor/admin chains instead of using `requireOrgContext` alone.

### F5. Low: Legacy Stripe and Rotessa reversal webhooks have weaker replay/audit handling than newer webhook flows

- Severity: Low
- Location:
  - `convex/payments/webhooks/stripe.ts:104-166`
  - `convex/payments/webhooks/rotessa.ts:78-132`
  - `convex/payments/webhooks/handleReversal.ts:51-110`
  - Contrast:
    - `convex/payments/webhooks/vopay.ts:347-446`
    - `convex/payments/webhooks/rotessaPad.ts:339-434`
    - `convex/payments/webhooks/transferCore.ts:48-98`, `124-174`
- Evidence:
  - Stripe and Rotessa verify signatures and then process immediately through `handlePaymentReversal`, without persisting raw verified events in `webhookEvents`.
  - Newer VoPay and Rotessa PAD flows persist verified raw bodies, track processing status, and patch metadata on the webhook event row.
- Impact:
  - Replay resistance is partially covered by transfer state checks, but these older webhook paths do not preserve the same forensic evidence, provider-event dedupe trail, or replay observability as the newer implementation.
- What appears sound:
  - Signature verification happens before JSON parsing.
  - Stripe includes a 5-minute timestamp tolerance in `convex/payments/webhooks/verification.ts:36-68`.
  - VoPay and Rotessa PAD processing is materially better and should be the reference model.
- Remediation:
  - Move Stripe and legacy Rotessa reversal handlers onto the same `webhookEvents` persistence and status model used by VoPay / Rotessa PAD.

### F6. Low: Demo route guard coverage is inconsistent

- Severity: Low
- Location:
  - No `beforeLoad`:
    - `src/routes/demo/convex.tsx:10-13`
    - `src/routes/demo/crm/route.tsx:14-17`
    - `src/routes/demo/document-engine/route.tsx:16-19`
    - `src/routes/demo/amps/route.tsx:4-6`
  - Guarded:
    - `src/routes/demo/rbac-auth/route.tsx:17-20`
    - `src/routes/demo/rbac/route.tsx:7-9`
  - Client-side-only AMPS check:
    - `src/components/demo/amps/hooks.ts:6-22`
- Evidence:
  - Several demo routes rely on client-side auth checks or backend failures instead of router-level denial.
- Impact:
  - This is mostly demo/test-only exposure, not the same severity as the backend findings above, but it increases discoverability of internal tooling and produces confusing runtime auth failures instead of clean route denial.
- Remediation:
  - Add `beforeLoad` guards to demo route roots that exercise protected or staff-only backend functions.

### F7. Low: RBAC documentation/test matrices do not include some backend-critical permissions

- Severity: Low
- Location:
  - `convex/fluent.ts:419-425`
  - `src/test/auth/permissions.ts:9-137`
  - `src/lib/rbac-display-metadata.ts:263-297`
- Evidence:
  - Backend chains rely on `cash_ledger:view` and `payment:view`.
  - The published role matrix and display metadata define `payment:manage` and `payment:view_own`, but not `payment:view`, `cash_ledger:view`, or `cash_ledger:correct`.
- Impact:
  - This creates policy drift and review ambiguity. It becomes hard to tell which roles should actually reach these surfaces, which in turn makes overbroad grants more likely.
- Remediation:
  - Add every backend-enforced permission to the role matrix and RBAC display metadata, even if the initial assignment set is empty.

## RBAC Matrix

| Surface | Frontend Guard | Backend Gate | Resource / Tenant Scope | Review Note |
| --- | --- | --- | --- | --- |
| FairLend staff admin surfaces | `/admin` route uses `canAccessAdminPath` | `adminQuery` / `requireFairLendAdmin` in `convex/fluent.ts:102-118`, `401` | staff-only | Good primitive, but not used consistently |
| Admin shell entity list | `/admin` requires `admin:access` | `requirePermission("admin:access")` in `convex/admin/queries.ts:11` | none | Boundary break; should be FairLend-admin only |
| Underwriting island | `/admin/underwriting` uses `guardAnyPermission(["admin:access","underwriter:access"])` | usually `uwQuery` / `uwMutation` or underwriter permission chains | no explicit resource scope in reviewed route files | Frontend gate is explicit and stronger than lint suggests |
| Payment read APIs | no reviewed route-layer equivalent | `paymentQuery` in `convex/fluent.ts:425` | none in reviewed handlers | High-risk BOLA surface |
| Cash-ledger read APIs | no reviewed route-layer equivalent | `cashLedgerQuery` in `convex/fluent.ts:419-421` | none in reviewed handlers | High-risk BOLA surface |
| Borrower self-service payments | not in focused route set | `paymentOwnQuery` in `convex/fluent.ts:438-440` | intended own-scope primitive exists | Safer pattern exists but is not used by reviewed payment admin reads |
| CRM control plane | mostly admin/demo UI | `crmAdminQuery` / `crmAdminMutation` in `convex/fluent.ts:450-456` | org-scoped | Sound for cross-tenant isolation |
| CRM data plane | admin/demo UI implies admin usage | `crmQuery` / `crmMutation` in `convex/fluent.ts:458-460` | org-scoped only | In-org least privilege missing |
| Document engine | demo routes unguarded | mostly `authedQuery` / `authedAction` | no role/resource gate | Explicit TODOs remain |
| New collection-plan admin workspace | AMPS route unguarded, but client skips unless FairLend admin | `adminQuery` in `convex/payments/collectionPlan/admin.ts:530-840` and `convex/demo/amps.ts:948-1008` | staff-only | Backend looks sound; route parity can improve |

## Route Guard Parity Notes

- The route linter over-reports child admin routes. `src/routes/admin/route.tsx:11-18` already guards the admin subtree, and `src/routes/admin/underwriting/route.tsx:8-13` adds an explicit underwriting exception path. Child-route warnings under `/admin/*` are mostly false positives.
- `_authenticated/authenticated` at `src/routes/_authenticated/authenticated.tsx:3-5` has no `beforeLoad` and should be treated as a real route-level gap if that subtree is used outside tests or examples.
- `/demo/rbac` and `/demo/rbac-auth` are protected only by `guardAuthenticated()`, not by a finer permission guard. That is acceptable for stakeholder-demo pages, but it should be intentional.
- `/demo/crm`, `/demo/document-engine`, `/demo/amps`, and many `/demo/convex-*` routes are unguarded at the router layer. Backend protections prevent some direct misuse, but the UX and exposure posture are still weak.

## Webhook Review Notes

- Sound:
  - `convex/payments/webhooks/verification.ts` uses HMAC verification and constant-time comparison.
  - Stripe verification includes timestamp tolerance.
  - VoPay and Rotessa PAD persist verified raw events and process them asynchronously with status tracking in `webhookEvents`.
  - `isTransferAlreadyInTargetState` in `convex/payments/webhooks/transferCore.ts:24-29` gives practical idempotency when the same business transition reappears.
- Concerns:
  - Legacy Stripe and Rotessa reversal handlers do not persist verified events before processing.
  - VoPay verification remains marked as a placeholder around exact provider header/encoding semantics in `convex/payments/webhooks/verification.ts:106-129`; this is acceptable in a greenfield phase but not strong enough to assume production-hardening is complete.
- Net:
  - Webhook signature verification is generally better than the app’s query authorization posture, but the implementation quality is inconsistent by provider generation.

## Prioritized Remediations

1. Replace `convex/admin/queries.ts` admin-shell gating with `adminQuery` / `requireFairLendAdmin`.
2. Add resource-aware authorization to all payment and cash-ledger reads that currently stop at `payment:view` or `cash_ledger:view`.
3. Introduce `document:view` and related document-engine permissions, then remove every auth-only TODO before treating document-engine as production-ready.
4. Decide whether CRM data-plane access is truly “all org members” or whether it needs viewer/editor/admin tiers; enforce that choice in backend chains, not just UI.
5. Normalize Stripe and legacy Rotessa reversal webhooks onto the same persisted-event model used by VoPay and Rotessa PAD.
6. Add router `beforeLoad` guards to sensitive demo roots so route-layer behavior matches backend expectations.
7. Bring RBAC docs/tests up to date with every backend-enforced permission, including `payment:view` and `cash_ledger:*`.
