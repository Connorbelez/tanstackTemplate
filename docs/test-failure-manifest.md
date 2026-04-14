# Test Failure Manifest

Generated on `2026-04-11` after restoring the original branch/worktree state and rerunning the suites.

Commands used:

- `bun run test` -> `12` failing tests, `9` failed files, `2` errors
- `bun run test:e2e` -> `101` failing Playwright tests, `52` did not run, `14` passed

Classification rubric:

- `implementation / regression`: the application code is internally inconsistent with the test's expectation, or the failure is caused by a real runtime bug in product code
- `test / harness issue`: the test fixture, selector, auth setup, saved storage state, or test runtime is the problem

Notes:

- This rerun supersedes the earlier harness-fix snapshot. The old `executionSource is not defined` bucket is no longer present on this restored branch.
- `.env.local` included `TEST_BROKER_ORG`, `TEST_LAWYER_ORG`, `TEST_LENDER_ORG`, and `TEST_BORROWER_ORG` during this rerun. Those values did not resolve the WorkOS/AuthKit `token_too_big` failures in Playwright setup.
- The entries are grouped where many failures share the same root cause. Every test listed under a group inherits that group's verdict and explanation.
- This document is triage only. It does not propose fixes.

## Targeted Rerun Update After Permission Reduction

Targeted rerun on `2026-04-11` after reducing admin permissions and using `admin:access` as the god permission:

- `bun run test:e2e -- e2e/auth.setup.ts e2e/amps/auth.setup.ts` -> `1` passed, `4` failed
- `bun run test:e2e -- e2e/document-engine/navigation.spec.ts` -> `4` failed, `3` did not run

What changed:

- The previous `token_too_big` AuthKit callback failure did not reproduce in the targeted auth-setup rerun.
- `authenticate as user` now passes.
- The remaining admin/member/amps-admin setup failures moved downstream into `e2e/helpers/auth-storage.ts`, where the harness times out waiting for the post-switch `/demo/workos` session readback to contain the expected org id / role.
- The Document Engine navigation suite is still blocked by auth harness instability, but in the targeted rerun it failed in `loginViaWorkOS` waiting for the WorkOS email textbox during `openAdminPage`, not with `token_too_big`.

Current implication:

- The permission-size problem appears improved or resolved.
- The active Playwright auth blocker is now the admin-org switching / session-verification harness, plus remaining instability in the fresh-login helper path.

## Follow-up Update After Auth Harness Fix

Follow-up reruns on `2026-04-11` after adding a dedicated `/e2e/session` route and refreshing the saved access token before persisting Playwright storage state:

- `bun run test:e2e -- e2e/auth.setup.ts e2e/amps/auth.setup.ts` -> `5` passed
- `bun run test:e2e --project=document-engine -- e2e/document-engine/navigation.spec.ts` -> `6` passed, `5` failed

New findings:

- The shared Playwright auth setup bucket is locally resolved. The admin/member/amps-admin setup specs now pass.
- The saved admin session now decodes to a token that includes `admin:access`; both the WorkOS auth state and the refreshed access-token claims match the expected admin org/role.
- The remaining Document Engine navigation failures are no longer caused by login/setup instability. They now fail inside live Convex queries with `Forbidden: permission "document:review" required`.
- Local code in `convex/fluent.ts` was updated so `admin:access` satisfies `requirePermission(...)`, but those backend changes are not reflected in the current dev deployment because Convex push/codegen is blocked by an existing module-analysis failure involving `convex/crm/__tests__/helpers.ts` and `@convex-dev/aggregate/src/test.ts`.

Current implication:

- The Playwright auth harness issue from `E1` is fixed locally.
- The remaining Document Engine failures should be treated as a backend deployment / environment-sync problem, not a remaining auth-setup problem.

## Vitest

### Group U1: AMPS offline collection flow no longer reaches the expected outbound stage

- Verdict: `implementation / regression`
- Explanation: the AMPS run-scoped offline lifecycle is not advancing to the stage the tests are written against. One test stalls at `dispersal_ready` instead of `outbound_pending_confirmation`, and the replay/idempotency path reports no payout creation on the first payout pass.

Affected tests:

- `convex/demo/__tests__/ampsE2e.test.ts` — `runs the full inbound-to-outbound offline lifecycle for a run-scoped scenario`
- `convex/demo/__tests__/ampsE2e.test.ts` — `seed replay and payout replay stay idempotent for the same runId`

### Group U2: Saved-view column filtering regression

- Verdict: `implementation / regression`
- Explanation: the CRM saved-view application logic still leaks default-visible columns into the effective schema even when the saved view excludes them.

Affected tests:

- `convex/crm/__tests__/userSavedViews.test.ts` — `applies the default personal table view to records and schema`

### Group U3: Payment cron test leaks scheduled work outside the test transaction

- Verdict: `test / harness issue`
- Explanation: the failing cron test times out and leaves unhandled `_scheduled_functions` writes outside a transaction. That points to the test runtime not draining or containing scheduled work correctly, not to a confirmed overflow-alert regression in business logic.

Affected tests:

- `convex/payments/__tests__/crons.test.ts` — `emits an alert log after more than three consecutive UTC business days of overflow`

### Group U4: Collection-plan admin test is still missing the required component/query registration in `convex-test`

- Verdict: `test / harness issue`
- Explanation: the failure is `Bad queryId` from the admin read model path, which matches the same audit-log/component registration harness problem seen earlier rather than a direct regression in the admin projections themselves.

Affected tests:

- `convex/payments/collectionPlan/__tests__/admin.test.ts` — `exposes stable admin read models for rules, plan entries, attempts, and mortgage summaries`

### Group U5: Mortgage lifecycle replay and settlement invariants are broken

- Verdict: `implementation / regression`
- Explanation: the lifecycle suites are now seeing negative trust cash, duplicated `CASH_RECEIVED` journal entries, and non-idempotent reversal/replay behavior. Those are product-level accounting and idempotency failures, not stale test expectations.

Affected tests:

- `src/test/convex/payments/mortgageLifecycleChaos.test.ts` — `keeps a monthly cycle single-write under scheduler replay and duplicate inbound/outbound confirmations`
- `src/test/convex/payments/mortgageLifecycleChaos.test.ts` — `reversal after a fully paid month creates one corrective obligation and stays idempotent on replay`
- `src/test/convex/payments/mortgageLifecycleChaos.test.ts` — `duplicate failed inbound delivery and runner replay create exactly one retry chain before clean recovery`
- `src/test/convex/payments/mortgageLifecycleFailureModes.test.ts` — `failed inbound month does not post cash and recovery month succeeds cleanly`
- `src/test/convex/payments/mortgageLifecycleFailureModes.test.ts` — `ownership transfer replay does not break supply or downstream allocations`
- `src/test/convex/payments/mortgageLifecycleReliability.test.ts` — `runs a 12-payment mortgage from schedule generation through month-12 maturity with a mid-term ownership transfer and cross-system invariants intact`

### Group U6: Provider registry resolves the wrong error path for unsupported provider codes

- Verdict: `implementation / regression`
- Explanation: the registry test for unknown/unimplemented providers now trips Rotessa production-env validation first and throws `ROTESSA_API_KEY is required...` instead of rejecting the unsupported provider code. That is product-code behavior drift, not a stale assertion.

Affected tests:

- `convex/payments/transfers/providers/__tests__/registry.test.ts` — `throws for unknown/unimplemented provider codes`

### Group U7: `admin-shell.test.ts` does not parse

- Verdict: `test / harness issue`
- Explanation: the file itself contains duplicate helper declarations (`buildFieldDef`, `buildBorrowerObjectDef`, `buildBorrowerRecord`), so Vitest fails during transform before any assertions run.

Affected file-level error:

- `src/test/admin/admin-shell.test.ts` — transform failure before test execution because helper symbols are declared more than once

## Playwright

### Group E1: Shared auth setup is failing with WorkOS/AuthKit `token_too_big`

- Verdict: `test / harness issue`
- Explanation: in the full-suite rerun, the setup projects failed in AuthKit callback handling with `token_too_big`. After the later permission-reduction change, that specific callback error stopped reproducing in the targeted rerun, but the same setup bucket still fails because the admin/member/amps-admin harness now times out verifying the switched org and role in `e2e/helpers/auth-storage.ts`.

Affected tests:

- `e2e/amps/auth.setup.ts` — `authenticate as amps admin` (`[amps-setup]`)
- `e2e/amps/auth.setup.ts` — `authenticate as amps admin` (`[setup]`)
- `e2e/auth.setup.ts` — `authenticate as user`
- `e2e/auth.setup.ts` — `authenticate as admin`
- `e2e/auth.setup.ts` — `authenticate as member`

### Group E2: Audit & Traceability demo is publicly routed but backed by auth-protected queries

- Verdict: `implementation / regression`
- Explanation: the route is publicly reachable, but the backing demo queries still throw `Unauthorized: sign in required` for anonymous users. The current rerun reproduced the same public-route/auth-query mismatch.

Affected tests:

- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Layout › tabs navigate between pages`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Transfers › shows empty state and seed button`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Transfers › seed data populates mortgages`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Transfers › create mortgage with PII fields`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Transfers › full transfer lifecycle: initiate → approve → complete`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Transfers › reject a transfer`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Transfers › traced lifecycle creates mortgage with all spans`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › renders mortgage selector buttons`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › selecting a mortgage shows chain verification result`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › event timeline shows hash chain data`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › PII fields are omitted in sanitized state`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › chain verification succeeds for valid chain`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › JSON export button is available for verified chain`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Audit Trail › query by resource shows results for a mortgage`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Audit Trail › switching to actor mode shows actor input`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Audit Trail › query by actor returns results for demo-anonymous`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Audit Trail › critical events section renders`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Audit Trail › rejecting a transfer shows a critical event`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Pipeline › shows pending/emitted/failed/latency status cards`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Pipeline › shows emission progress bar`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Pipeline › emit pending events button works`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Pipeline › 5-layer defense-in-depth is displayed`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Pipeline › emitting reduces pending count`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Access Log › renders access log page with header`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Access Log › shows access entries after visiting other audit pages`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Access Log › access entries show actor and page info`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Report › renders compliance report with summary cards`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Report › shows all five control sections`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Report › control cards show regulatory standard references`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Report › hash chain control lists all entities with pass/fail`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Report › PII sanitization control lists omitted fields`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Report › outbox delivery shows pipeline metrics`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Report › download JSON button is present`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Report › report shows PASS status for hash chain integrity with valid data`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Report › report shows PASS for component isolation`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Report › generated timestamp is recent`
- `e2e/audit-traceability.spec.ts` — `Audit & Traceability — Integration › create mortgage → verify hash chain → check audit trail → emit`

### Group E3: Ownership Ledger demo has the same public-route/auth-query mismatch

- Verdict: `implementation / regression`
- Explanation: the public Ownership Ledger demo still falls into unauthorized state instead of rendering a usable anonymous demo. This rerun reproduced the same mismatch across the whole suite.

Affected tests:

- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Layout › renders page title and description`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Layout › shows controls card with seed button`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Layout › shows demo- prefix help text`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Seed Data › seed button populates mortgages and journal`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Seed Data › seed is idempotent — shows message if data exists`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Mortgage Cards › Greenfield mortgage shows correct investor positions`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Mortgage Cards › Riverside mortgage shows correct positions`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Mortgage Cards › invariant badges show valid state (green check)`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Mortgage Cards › treasury balance shown for each mortgage`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Transfers › transfer form has all required fields`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Transfers › execute a share transfer between investors`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Transfers › minimum position help text visible`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Issue Shares › issue tab shows correct form fields`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Issue Shares › issue shares to a new investor from treasury`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Redeem Shares › redeem tab shows correct form fields`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Redeem Shares › redeem shares from an investor back to treasury`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Journal Log › journal log table is visible with entries`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Journal Log › journal has correct column headers`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Journal Log › journal entries show MORTGAGE MINTED and SHARES ISSUED for seed data`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Journal Log › seed entries are tagged with seed source badge`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Cleanup › cleanup removes all demo data`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Cleanup › cleanup button is disabled when no data exists`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Full Lifecycle › seed → transfer → issue → redeem → cleanup`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Error Handling › transfer button is disabled when form is incomplete`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Error Handling › issue button is disabled when form is incomplete`
- `e2e/convex-ledger.spec.ts` — `Ledger Demo — Error Handling › redeem button is disabled when form is incomplete`

### Group E4: Document Engine admin harness is blocked by AuthKit setup failures

- Verdict: `test / harness issue`
- Explanation: the Document Engine routes are admin-guarded, and this rerun failed in the auth bootstrap path with `token_too_big` and sign-in redirects before the page-specific assertions could meaningfully exercise the feature. The failing tests are therefore still harness/auth failures first.

Affected tests:

- `e2e/document-engine/designer.spec.ts` — `Document Engine - Template Designer › designer page loads with template info and toolbar`
- `e2e/document-engine/generate.spec.ts` — `Document Engine - Generate Page › generate page renders with mode toggle and source selector`
- `e2e/document-engine/generate.spec.ts` — `Document Engine - Generate Page › can toggle between template and group mode`
- `e2e/document-engine/generate.spec.ts` — `Document Engine - Generate Page › generate button not shown before selection`
- `e2e/document-engine/groups.spec.ts` — `Document Engine - Template Groups › groups page renders with heading and create button`
- `e2e/document-engine/groups.spec.ts` — `Document Engine - Template Groups › create dialog has name and description fields`
- `e2e/document-engine/groups.spec.ts` — `Document Engine - Template Groups › can create a group and see it in the list`
- `e2e/document-engine/groups.spec.ts` — `Document Engine - Template Groups › can expand a group to see its details`
- `e2e/document-engine/groups.spec.ts` — `Document Engine - Template Groups › create group button is disabled without name`
- `e2e/document-engine/library.spec.ts` — `Document Engine - Base PDF Library › library page renders with heading and upload button`
- `e2e/document-engine/library.spec.ts` — `Document Engine - Base PDF Library › upload dialog opens with correct form elements`
- `e2e/document-engine/library.spec.ts` — `Document Engine - Base PDF Library › can upload a PDF and see it in the library`
- `e2e/document-engine/library.spec.ts` — `Document Engine - Base PDF Library › shows empty state or PDF cards after data loads`
- `e2e/document-engine/navigation.spec.ts` — `Document Engine - Navigation & Layout › layout renders with page title and navigation`
- `e2e/document-engine/navigation.spec.ts` — `Document Engine - Navigation & Layout › can navigate to library page`
- `e2e/document-engine/navigation.spec.ts` — `Document Engine - Navigation & Layout › can navigate to templates page`
- `e2e/document-engine/navigation.spec.ts` — `Document Engine - Navigation & Layout › can navigate to generate page`
- `e2e/document-engine/templates.spec.ts` — `Document Engine - Templates › templates page renders with heading`
- `e2e/document-engine/templates.spec.ts` — `Document Engine - Templates › new template button is enabled when base PDFs exist`
- `e2e/document-engine/templates.spec.ts` — `Document Engine - Templates › create dialog shows available base PDFs`
- `e2e/document-engine/templates.spec.ts` — `Document Engine - Templates › can create a template and see it with Draft Only status`
- `e2e/document-engine/templates.spec.ts` — `Document Engine - Templates › can navigate to designer from template card`
- `e2e/document-engine/variables.spec.ts` — `Document Engine - System Variables › variables page renders with heading and add button`
- `e2e/document-engine/variables.spec.ts` — `Document Engine - System Variables › create dialog has all expected form elements`
- `e2e/document-engine/variables.spec.ts` — `Document Engine - System Variables › can create a string variable and see it in the list`
- `e2e/document-engine/variables.spec.ts` — `Document Engine - System Variables › can create a currency variable with correct formatting`
- `e2e/document-engine/variables.spec.ts` — `Document Engine - System Variables › create button is disabled without required fields`
- `e2e/document-engine/variables.spec.ts` — `Document Engine - System Variables › shows error for invalid key format`
- `e2e/document-engine/workflow.spec.ts` — `Document Engine - Full Workflow › 1. upload a base PDF to the library`

### Group E5: Demo listings detail routes are not rendering the expected pages

- Verdict: `implementation / regression`
- Explanation: known and unknown listing-detail routes are still rendering the wrong shell/redirect state instead of the listing detail or route-level not-found UI.

Affected tests:

- `e2e/demo-listings.spec.ts` — `Demo listing detail page › renders a known listing and supports desktop interactions`
- `e2e/demo-listings.spec.ts` — `Demo listing detail page › renders a not-found state for unknown listings`
- `e2e/demo-listings.spec.ts` — `Demo listing detail page › renders the mobile composition`

### Group E6: One Governed Transitions journal assertion still uses stale UI/data assumptions

- Verdict: `test / harness issue`
- Explanation: the only remaining failure in this spec is a journal search assertion that expects a `CLOSE.*funded.*closed` row to be present and visible. The failure is in the selector/data expectation layer, not evidence of a new state-machine regression by itself.

Affected tests:

- `e2e/governed-transitions.spec.ts` — `Governed Transitions — T-045A: Journal Read-Only › journal search input filters entries`

## Additional Findings

- The previous `executionSource is not defined` collection-plan crash is not part of the current rerun.
- Playwright's `52 did not run` count is downstream fallout from the auth/setup and first-test failures above; it is not a separate failure bucket.
