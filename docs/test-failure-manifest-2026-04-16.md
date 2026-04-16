# Test Failure Manifest - 2026-04-16

Generated from the supplied `bun run test` output and a code-inspection triage pass on `2026-04-16`.

Scope:

- `8` failed suites
- `11` failed tests
- `2` unhandled errors

Verdict labels:

- `bad implementation / regression`: current application code or canonical policy is wrong
- `out-of-date test / harness issue`: the failing expectation, fixture, import path, or test runtime no longer matches the current codebase

## Summary

- `4` items are implementation or policy drift issues
- `17` items are stale test / harness issues

## Group 1 - Stale cash-ledger test helper import path

Verdict: `out-of-date test / harness issue`

Why:

- These suites never reach product code. They fail during module resolution.
- The tests still import `convex/payments/cashLedger/__tests__/testUtils`.
- The shared helper now lives at `src/test/convex/payments/cashLedger/testUtils.ts`.

Evidence:

- Old imports still exist in the failing suites.
- The moved helper exports the same symbols (`createHarness`, `SYSTEM_SOURCE`, `seedMinimalEntities`, `createTestAccount`) from `src/test/convex/payments/cashLedger/testUtils.ts`.

Affected items:

- `convex/engine/effects/__tests__/obligationAccrual.integration.test.ts`
- `convex/engine/effects/__tests__/transfer.test.ts`
- `convex/payments/obligations/__tests__/correctiveObligation.test.ts`
- `convex/payments/payout/__tests__/adminPayout.test.ts`
- `convex/payments/payout/__tests__/batchPayout.test.ts`
- `convex/payments/webhooks/__tests__/eftVopayWebhook.test.ts`
- `convex/payments/webhooks/__tests__/reversalIntegration.test.ts`
- `convex/payments/webhooks/__tests__/vopayWebhook.test.ts`

Checklist fix plan:

- [ ] Update all eight imports to `src/test/convex/payments/cashLedger/testUtils`.
- [ ] If backward compatibility is useful, add a tiny shim file at the old path that re-exports the new helper.
- [ ] Rerun only these eight suites after the import fix to expose any deeper failures.

## Group 2 - Saved-view visibility regression in CRM

Verdict: `bad implementation / regression`

Why:

- The failing test expects a saved view's `visibleFieldIds` to be authoritative.
- `convex/crm/viewState.ts` currently computes column visibility with:
  `visibleFieldIds.has(fieldId) || baseColumn.isVisibleByDefault`
- That `|| baseColumn.isVisibleByDefault` causes saved views to leak default-visible columns like `next_followup`, `deal_value`, and `is_active` even when the saved view excludes them.

Evidence:

- Failing item: `convex/crm/__tests__/userSavedViews.test.ts` -> `applies the default personal table view to records and schema`
- Code path: `buildEffectiveColumns(...)` in `convex/crm/viewState.ts`

Affected items:

- `convex/crm/__tests__/userSavedViews.test.ts` - `applies the default personal table view to records and schema`

Checklist fix plan:

- [ ] Change saved-view column visibility so an active saved view overrides default visibility instead of being OR'd with it.
- [ ] Preserve `isVisibleByDefault` only for the no-saved-view case.
- [ ] Add a regression test that explicitly hides a default-visible field through a saved view and verifies both schema and row payloads.

## Group 3 - AMPS payout replay test expects obsolete bridge summary semantics

Verdict: `out-of-date test / harness issue`

Why:

- `triggerOfflineLifecyclePayout` delegates to `internal.dispersal.disbursementBridge.triggerDisbursementBridge`.
- `findEligibleEntriesInternal` filters out `dispersalEntries` that already have `transferRequestId`.
- After the first payout run, the second run sees `0` eligible entries instead of one eligible entry that is counted as `skippedIdempotent`.
- The duplicate-prevention invariant still holds; the summary counter expectation is the stale part.

Evidence:

- Failing item: `convex/demo/__tests__/ampsE2e.test.ts` -> `seed replay and payout replay stay idempotent for the same runId`
- Code paths:
  - `convex/demo/ampsE2e.ts` -> `triggerOfflineLifecyclePayout`
  - `convex/dispersal/disbursementBridge.ts` -> `findEligibleEntriesInternal` and `triggerDisbursementBridge`

Affected items:

- `convex/demo/__tests__/ampsE2e.test.ts` - `seed replay and payout replay stay idempotent for the same runId`

Checklist fix plan:

- [ ] Update the test to assert the actual idempotency invariant: no duplicate outbound transfer is created on the second payout trigger.
- [ ] If the product contract should report `skippedIdempotent` on the second trigger, change the bridge contract intentionally and add a bridge-level test for that behavior.
- [ ] Keep the scenario-state assertions (`rowCounts.transfers`, outbound status) so the test still protects the real workflow.

## Group 4 - Workout write-handler auth expectation predates the staff-admin boundary

Verdict: `out-of-date test / harness issue`

Why:

- The public workout write handlers are built on `paymentMutation`.
- `paymentMutation` is `adminMutation.use(requirePermission("payment:manage"))`.
- `adminMutation` applies the FairLend staff admin boundary before resource-level checks.
- The test uses a `member` identity with `payment:*` permissions and expects a resource-scope error, but the current chain correctly fails earlier with `Forbidden: fair lend admin role required`.

Evidence:

- Failing item: `convex/payments/collectionPlan/__tests__/workout.test.ts` -> `requires mortgage or workout ownership for public write handlers`
- Code path: `convex/payments/collectionPlan/workout.ts` exports `createWorkoutPlan`, `activateWorkoutPlan`, `completeWorkoutPlan`, and `cancelWorkoutPlan` from `paymentMutation`

Affected items:

- `convex/payments/collectionPlan/__tests__/workout.test.ts` - `requires mortgage or workout ownership for public write handlers`

Checklist fix plan:

- [ ] Update the negative-auth expectation to the current staff-admin boundary.
- [ ] Add a separate test that uses a valid FairLend admin identity but the wrong resource scope if you still want to verify `no mortgage access` / `no workout plan access`.
- [ ] Reconfirm the desired product policy before weakening `paymentMutation`; current repo docs say explicit FairLend staff boundaries remain structural.

## Group 5 - Cash-ledger query auth tests use an identity that is now allowed by policy

Verdict: `out-of-date test / harness issue`

Why:

- The failing queries are all exported from `cashLedgerQuery`.
- `cashLedgerQuery` is `adminQuery.use(requirePermission("cash_ledger:view"))`.
- `adminQuery` requires FairLend staff admin.
- Runtime permission helpers now treat `admin:access` / FairLend staff admin status as a super-permission for `requirePermission(...)`.
- The test's `WRONG_PERMISSION_IDENTITY` is still a FairLend staff `admin`, so the permission boundary the test is trying to prove is no longer reachable through this chain.

Evidence:

- Failing items are all in `convex/payments/cashLedger/__tests__/queries.test.ts`
- The stale fixture is `WRONG_PERMISSION_IDENTITY`
- Policy reference: `docs/architecture/rbac-and-permissions.md`

Affected items:

- `convex/payments/cashLedger/__tests__/queries.test.ts` - `rejects ledger:view (without cash_ledger:view) on getAccountBalanceRange`
- `convex/payments/cashLedger/__tests__/queries.test.ts` - `rejects ledger:view (without cash_ledger:view) on getBorrowerBalance`
- `convex/payments/cashLedger/__tests__/queries.test.ts` - `rejects ledger:view (without cash_ledger:view) on getBalancesByFamily`

Checklist fix plan:

- [ ] Replace these expectations with staff-boundary tests that reflect the current `adminQuery` design.
- [ ] If you still want a pure `cash_ledger:view` authorization test, cover it through a chain that is not already gated by `adminQuery`.
- [ ] Rename or remove `WRONG_PERMISSION_IDENTITY` so the fixture name does not imply a behavior the policy no longer supports.

## Group 6 - Collection-attempt reconciliation test uses an under-privileged transfer operator fixture

Verdict: `out-of-date test / harness issue`

Why:

- `cancelTransfer` is exported from `paymentCancelMutation`.
- `paymentCancelMutation` is `adminMutation.use(requirePermission("payment:cancel"))`.
- The suite's `PAYMENT_HANDLER_IDENTITY` has payment permissions but is missing FairLend staff org/admin claims.
- The same endpoint already has passing coverage in `convex/payments/transfers/__tests__/handlers.integration.test.ts` with a FairLend staff admin identity.

Evidence:

- Failing item: `convex/payments/transfers/__tests__/collectionAttemptReconciliation.integration.test.ts` -> `cancelTransfer cancels the linked collection attempt without posting money`
- The suite-local `PAYMENT_HANDLER_IDENTITY` lacks `org_id` and does not satisfy `requireFairLendAdmin`

Affected items:

- `convex/payments/transfers/__tests__/collectionAttemptReconciliation.integration.test.ts` - `cancelTransfer cancels the linked collection attempt without posting money`

Checklist fix plan:

- [ ] Align this suite's transfer operator fixture with the handler-suite fixture that already satisfies the payment admin chain.
- [ ] Keep the business assertions about linked attempt cancellation and zero cash-ledger postings after auth is fixed.
- [ ] Add a dedicated auth-denial test if this suite also wants to exercise the negative path.

## Group 7 - Role-chain matrix still expects external org admins to pass a staff-only cash-ledger mutation

Verdict: `out-of-date test / harness issue`

Why:

- `cashLedgerMutation` is built on `adminMutation`, not just `requirePermission("cash_ledger:correct")`.
- External org admins do not satisfy the FairLend staff admin boundary.
- The current chain definition and repo policy both say staff-only boundaries remain separate from the admin super-permission.

Evidence:

- Failing item: `src/test/auth/chains/role-chains.test.ts` -> `cashLedgerMutation (cash_ledger:correct) > allows EXTERNAL_ORG_ADMIN`
- Code path: `convex/fluent.ts`

Affected items:

- `src/test/auth/chains/role-chains.test.ts` - `cashLedgerMutation (cash_ledger:correct) > allows EXTERNAL_ORG_ADMIN`

Checklist fix plan:

- [ ] Remove `EXTERNAL_ORG_ADMIN` from the allowed matrix for `cashLedgerMutation`.
- [ ] Add an explicit denial assertion for external org admins if you want the boundary captured intentionally.
- [ ] Audit the rest of the chain matrix for any other expectations that confuse permission override with FairLend staff boundary bypass.

## Group 8 - Admin role permission catalog is still broader than the canonical RBAC policy

Verdict: `bad implementation / regression`

Why:

- The canonical RBAC doc says `admin` should get exactly one WorkOS permission: `admin:access`.
- `convex/auth/permissionCatalog.ts` still assigns many explicit permissions directly to `ROLE_PERMISSIONS.admin`, including `deal:view`, `deal:manage`, and `ledger:view`.
- These failing tests are catching real policy drift in repo code, not a stale expectation.

Evidence:

- Canonical policy: `docs/architecture/rbac-and-permissions.md`
- Current implementation: `convex/auth/permissionCatalog.ts`
- Fixture impact: `lookupPermissions(["admin"])` still inflates admin identities in tests

Affected items:

- `src/test/auth/permissions/new-permissions.test.ts` - `deal:view in ROLE_PERMISSIONS > admin does NOT have deal:view`
- `src/test/auth/permissions/new-permissions.test.ts` - `deal:manage in ROLE_PERMISSIONS > admin does NOT have deal:manage`
- `src/test/auth/permissions/new-permissions.test.ts` - `ledger:view in ROLE_PERMISSIONS > admin does NOT have ledger:view`

Checklist fix plan:

- [ ] Reduce `ROLE_PERMISSIONS.admin` to the canonical WorkOS assignment (`admin:access`) instead of duplicating non-admin permissions onto admin.
- [ ] Update any admin fixtures that currently rely on `lookupPermissions(["admin"])` to either use `admin:access` only or add explicit test-only permissions intentionally.
- [ ] Rerun the auth permission catalog tests after the catalog and fixture cleanup to catch the next layer of drift.

## Group 9 - Cron suite leaves scheduled work behind after the assertions finish

Verdict: `out-of-date test / harness issue`

Why:

- The suite's assertions are not the items failing here; Vitest reports unhandled `_scheduled_functions` writes after the cron tests run.
- The error signature matches scheduled work escaping the `convex-test` transaction boundary after fake timers and `finishAllScheduledFunctions(...)` are used.
- The repo already has a prior manifest entry for the same pattern and classifies it as a test-runtime issue.

Evidence:

- Unhandled errors:
  - `Unhandled Rejection: Write outside of transaction 10008;_scheduled_functions`
  - `Unhandled Rejection: Write outside of transaction 10009;_scheduled_functions`
- Origin reported by Vitest: `convex/payments/__tests__/crons.test.ts`
- Likely trigger point: tests using `vi.useFakeTimers()` plus `t.finishAllScheduledFunctions(vi.runAllTimers)`

Affected items:

- `convex/payments/__tests__/crons.test.ts` - unhandled rejection after `transitions due obligations to overdue when gracePeriodEnd <= now`
- `convex/payments/__tests__/crons.test.ts` - second unhandled `_scheduled_functions` write reported by Vitest in the same file

Checklist fix plan:

- [ ] Wrap fake-timer cron tests in `try/finally` blocks that always restore timers after draining scheduled work.
- [ ] Verify that every cron path using scheduled effects fully drains the queue before test exit.
- [ ] Rerun `convex/payments/__tests__/crons.test.ts` with Vitest's `hanging-process` reporter to identify the leftover scheduler activity precisely.
- [ ] If the issue persists, reduce the registered test components for this suite or use the repo's shared scheduled-work helper utilities to isolate the runtime.

## Per-item Manifest

Each item below inherits the verdict from its root-cause group.

| Item | Type | Verdict | Root cause |
| --- | --- | --- | --- |
| `convex/engine/effects/__tests__/obligationAccrual.integration.test.ts` | failed suite | out-of-date test / harness issue | stale `testUtils` import |
| `convex/engine/effects/__tests__/transfer.test.ts` | failed suite | out-of-date test / harness issue | stale `testUtils` import |
| `convex/payments/obligations/__tests__/correctiveObligation.test.ts` | failed suite | out-of-date test / harness issue | stale `testUtils` import |
| `convex/payments/payout/__tests__/adminPayout.test.ts` | failed suite | out-of-date test / harness issue | stale `testUtils` import |
| `convex/payments/payout/__tests__/batchPayout.test.ts` | failed suite | out-of-date test / harness issue | stale `testUtils` import |
| `convex/payments/webhooks/__tests__/eftVopayWebhook.test.ts` | failed suite | out-of-date test / harness issue | stale `testUtils` import |
| `convex/payments/webhooks/__tests__/reversalIntegration.test.ts` | failed suite | out-of-date test / harness issue | stale `testUtils` import |
| `convex/payments/webhooks/__tests__/vopayWebhook.test.ts` | failed suite | out-of-date test / harness issue | stale `testUtils` import |
| `convex/crm/__tests__/userSavedViews.test.ts` - `applies the default personal table view to records and schema` | failed test | bad implementation / regression | saved-view visibility logic leaks default columns |
| `convex/demo/__tests__/ampsE2e.test.ts` - `seed replay and payout replay stay idempotent for the same runId` | failed test | out-of-date test / harness issue | bridge summary semantics changed |
| `convex/payments/collectionPlan/__tests__/workout.test.ts` - `requires mortgage or workout ownership for public write handlers` | failed test | out-of-date test / harness issue | test predates `paymentMutation` staff-admin boundary |
| `convex/payments/cashLedger/__tests__/queries.test.ts` - `rejects ledger:view (without cash_ledger:view) on getAccountBalanceRange` | failed test | out-of-date test / harness issue | admin super-permission makes fixture valid |
| `convex/payments/cashLedger/__tests__/queries.test.ts` - `rejects ledger:view (without cash_ledger:view) on getBorrowerBalance` | failed test | out-of-date test / harness issue | admin super-permission makes fixture valid |
| `convex/payments/cashLedger/__tests__/queries.test.ts` - `rejects ledger:view (without cash_ledger:view) on getBalancesByFamily` | failed test | out-of-date test / harness issue | admin super-permission makes fixture valid |
| `convex/payments/transfers/__tests__/collectionAttemptReconciliation.integration.test.ts` - `cancelTransfer cancels the linked collection attempt without posting money` | failed test | out-of-date test / harness issue | suite fixture is missing staff-admin auth |
| `src/test/auth/chains/role-chains.test.ts` - `cashLedgerMutation (cash_ledger:correct) > allows EXTERNAL_ORG_ADMIN` | failed test | out-of-date test / harness issue | expected matrix conflicts with staff-only chain |
| `src/test/auth/permissions/new-permissions.test.ts` - `deal:view in ROLE_PERMISSIONS > admin does NOT have deal:view` | failed test | bad implementation / regression | admin catalog still duplicates non-admin permissions |
| `src/test/auth/permissions/new-permissions.test.ts` - `deal:manage in ROLE_PERMISSIONS > admin does NOT have deal:manage` | failed test | bad implementation / regression | admin catalog still duplicates non-admin permissions |
| `src/test/auth/permissions/new-permissions.test.ts` - `ledger:view in ROLE_PERMISSIONS > admin does NOT have ledger:view` | failed test | bad implementation / regression | admin catalog still duplicates non-admin permissions |
| `convex/payments/__tests__/crons.test.ts` - unhandled rejection `Write outside of transaction ... _scheduled_functions` | unhandled error | out-of-date test / harness issue | scheduled work not fully drained |
| `convex/payments/__tests__/crons.test.ts` - second unhandled rejection `Write outside of transaction ... _scheduled_functions` | unhandled error | out-of-date test / harness issue | scheduled work not fully drained |

