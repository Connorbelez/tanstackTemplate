# Test Failure Manifest

Generated on `2026-04-11`.

Commands used:

- `bun run test` -> `51` failing Vitest tests
- `bun run test:e2e` -> `115` failing Playwright tests (`25` did not run, `27` passed)

Classification rubric:

- `implementation / regression`: the application code is internally inconsistent with the test's expectation, or the failure is caused by a real runtime bug in product code
- `test / harness issue`: the test fixture, selector, auth setup, or stale expectation is the problem

Notes:

- The entries are grouped where many tests share the same root cause. Every test listed under a group inherits that group's verdict and explanation.
- This document is a triage manifest only. It does not propose fixes.

## Update After Harness-Fix Pass

Post-triage worker pass on `2026-04-11`:

- Targeted Vitest rerun across the harness buckets passed `10/11` files and `235/240` tests. The only remaining failures in that sweep were the five `U1` `executionSource is not defined` failures in `convex/payments/collectionPlan/__tests__/execution.test.ts`.
- Narrow Playwright rerun confirmed the remaining `E3` Governed Transitions cases now pass (`3 passed`).

Resolved and newly passing groups:

- `U3` — `recordLinks.test.ts` now passes with the audit-log component registered through the official package test registrar.
- `U4` — the member-saved-view expectation was updated to match the current admin-only CRM authorization contract. The file still contains the separate `U2` implementation regression.
- `U5` — `viewEngine.test.ts` now passes with the current computed-field `fieldDefId` expectation.
- `U6` — `deal.integration.test.ts` now passes after fixing the audit-log test registration path and draining background scheduled work with local fake-timer cleanup.
- `U7` — the `FUNDS_SETTLED` assertion now matches the machine's current `recordSettlementObserved` behavior.
- `U8` — the mixed-obligation execution test now reaches the intended rejection path instead of failing in fixture setup.
- `U9` — the rule-contract tests now assert the current typed `config` behavior instead of legacy `parameters` fallback behavior.
- `U10` — the transfer-reconciliation tests now match the current escalation behavior instead of the removed self-healing behavior.
- `U11` — the VoPay webhook fixtures now seed the required transfer context and the targeted webhook files pass.
- `U12` — the transfer settlement integration test now matches the current transfer-owned cash receipt model.
- `U13` — the hash-chain reconciliation tests now seed the richer current `auditJournal` shape and pass.
- `E3` — the governed-transitions specs now use scoped selectors and role-based assertions for the remaining ambiguous elements.

Patched but not fully re-verified because auth or environment behavior remained unstable:

- `E4` — the Document Engine specs now bootstrap fresh admin auth state for guarded routes, but targeted verification remained flaky/blocked on auth behavior.
- `E6` — the WorkOS profile tests now scope the email assertion to the profile email card, but verification was interrupted by shared auth setup timeouts.
- `E7` — the RBAC specs now assert the resolved role badge via a helper, but verification was interrupted by shared auth setup timeouts.
- `E8` — the onboarding spec now generates fresh auth state at runtime and verifies the active org before persisting storage, but fresh WorkOS callback verification hit `token_too_big`.
- `E9` — the protected-routes spec now asserts the current `*.authkit.app` redirect host, but the verification run was interrupted before completion.
- `E10` — the simulation spec no longer branches on a hard-coded `3s` success window or parses the remaining balance from the error string, but verification remained environment-limited.

Reclassified after verification:

- `E5` should now be treated as `implementation / regression`, not `test / harness issue`. The original stale slug was real, but browser verification showed both known and unknown `/demo/listings/$listingid` routes rendering only the app shell with sign-in links instead of the detail page or the route-level not-found UI. That points to a route/rendering problem in app code, not just stale test data.

Additional auth note:

- `.env.local` now includes role-specific org ids (`TEST_BROKER_ORG`, `TEST_LAWYER_ORG`, `TEST_LENDER_ORG`, `TEST_BORROWER_ORG`). Those were not required for the worker pass above, but they may be useful for future role-specific e2e auth harness cleanup if the older shared org assumptions continue to drift.

## Vitest

### Group U1: Collection-plan execution crash

- Verdict: `implementation / regression`
- Explanation: `convex/payments/collectionPlan/execution.ts` references `executionSource` before it is defined. That throws `ReferenceError: executionSource is not defined`, prevents attempt creation, and cascades into the runner and long-form lifecycle harnesses.

Affected tests:

- `convex/demo/__tests__/ampsE2e.test.ts` — `demo.ampsE2e runs the full inbound-to-outbound offline lifecycle for a run-scoped scenario`
- `convex/demo/__tests__/ampsE2e.test.ts` — `demo.ampsE2e cleanup removes partial scenarios and is replay-safe`
- `convex/demo/__tests__/ampsE2e.test.ts` — `demo.ampsE2e seed replay and payout replay stay idempotent for the same runId`
- `convex/payments/collectionPlan/__tests__/admin.test.ts` — `collection plan admin surfaces exposes stable admin read models for rules, plan entries, attempts, and mortgage summaries`
- `convex/payments/collectionPlan/__tests__/execution.test.ts` — `executePlanEntry creates exactly one collection attempt for an eligible plan entry`
- `convex/payments/collectionPlan/__tests__/execution.test.ts` — `executePlanEntry returns already_executed on replay without creating a duplicate attempt`
- `convex/payments/collectionPlan/__tests__/execution.test.ts` — `executePlanEntry recovers a linked transfer when an initiated attempt lost transferRequestId`
- `convex/payments/collectionPlan/__tests__/execution.test.ts` — `executePlanEntry preserves the created attempt when Payment Rails handoff fails`
- `convex/payments/collectionPlan/__tests__/execution.test.ts` — `executePlanEntry replays without duplicates after transfer creation succeeds but initiation fails`
- `convex/payments/collectionPlan/__tests__/reschedule.test.ts` — `reschedulePlanEntry keeps the original entry non-executable and lets the replacement execute through the runner`
- `convex/payments/collectionPlan/__tests__/reschedule.test.ts` — `reschedulePlanEntry keeps retry lineage attached to the replacement entry when a rescheduled execution fails`
- `convex/payments/collectionPlan/__tests__/runner.test.ts` — `processDuePlanEntries executes only due planned entries through the full manual spine`
- `convex/payments/collectionPlan/__tests__/runner.test.ts` — `processDuePlanEntries is replay-safe across cron reruns`
- `convex/payments/collectionPlan/__tests__/runner.test.ts` — `processDuePlanEntries keeps failure execution durable and feeds the retry loop`
- `convex/payments/collectionPlan/__tests__/workout.test.ts` — `workout plans keeps retry ownership on a failed workout execution`
- `src/test/convex/payments/mortgageLifecycleChaos.test.ts` — `mortgage lifecycle chaos keeps a monthly cycle single-write under scheduler replay and duplicate inbound/outbound confirmations`
- `src/test/convex/payments/mortgageLifecycleChaos.test.ts` — `mortgage lifecycle chaos ignores a late failure event after inbound settlement and preserves the confirmed monthly cycle`
- `src/test/convex/payments/mortgageLifecycleChaos.test.ts` — `mortgage lifecycle chaos reversal after a fully paid month creates one corrective obligation and stays idempotent on replay`
- `src/test/convex/payments/mortgageLifecycleChaos.test.ts` — `mortgage lifecycle chaos duplicate failed inbound delivery and runner replay create exactly one retry chain before clean recovery`
- `src/test/convex/payments/mortgageLifecycleFailureModes.test.ts` — `mortgage lifecycle failure modes duplicate inbound webhook event does not create a second cash receipt`
- `src/test/convex/payments/mortgageLifecycleFailureModes.test.ts` — `mortgage lifecycle failure modes duplicate outbound webhook event does not create a second lender payout`
- `src/test/convex/payments/mortgageLifecycleFailureModes.test.ts` — `mortgage lifecycle failure modes re-running the disbursement bridge is idempotent for already-created outbound transfers`
- `src/test/convex/payments/mortgageLifecycleFailureModes.test.ts` — `mortgage lifecycle failure modes failed inbound month does not post cash and recovery month succeeds cleanly`
- `src/test/convex/payments/mortgageLifecycleFailureModes.test.ts` — `mortgage lifecycle failure modes ownership transfer replay does not break supply or downstream allocations`
- `src/test/convex/payments/mortgageLifecycleReliability.test.ts` — `mortgage lifecycle reliability runs a 12-payment mortgage from schedule generation through month-12 maturity with a mid-term ownership transfer and cross-system invariants intact`

### Group U2: Saved-view column filtering regression

- Verdict: `implementation / regression`
- Explanation: `convex/crm/viewState.ts` keeps `baseColumn.isVisibleByDefault` columns visible even when the saved view excludes them. The default personal view test expects the saved view to narrow visible columns, but the implementation still leaks default-visible system columns.

Affected tests:

- `convex/crm/__tests__/userSavedViews.test.ts` — `CRM user saved views applies the default personal table view to records and schema`

### Group U3: Audit-log component registration missing in `convex-test`

- Verdict: `test / harness issue`
- Explanation: these failures are caused by the test runtime not registering the audit-log component correctly, which produces `Component "...aggregateBySeverity" is not registered` / `Bad queryId` errors before the actual business logic is exercised.

Affected tests:

- `convex/crm/__tests__/recordLinks.test.ts` — `cardinality: many_to_many allows unlimited links`
- `convex/crm/__tests__/recordLinks.test.ts` — `duplicate detection allows re-creation after soft-delete`

### Group U4: CRM auth expectation drift

- Verdict: `test / harness issue`
- Explanation: `convex/fluent.ts` currently aliases the CRM read/write chains to admin-only builders. The failing test assumes non-admin users can create and manage personal saved views, but that is not what the current code intentionally exposes.

Affected tests:

- `convex/crm/__tests__/userSavedViews.test.ts` — `CRM user saved views enforces one default saved view per owner and scopes access per user`

### Group U5: Computed-field metadata expectation drift

- Verdict: `test / harness issue`
- Explanation: `convex/crm/viewState.ts` now synthesizes a `fieldDefId` for computed fields (`computed:${fieldName}`). The test still expects computed fields to have no `fieldDefId`, so the assertion is stale.

Affected tests:

- `convex/crm/__tests__/viewEngine.test.ts` — `System object view queries getViewSchema applies dedicated field overrides and computed fields`

### Group U6: Deal integration harness cascade after audit component failure

- Verdict: `test / harness issue`
- Explanation: the first failure in this suite is another audit-log component registration problem. The later `test began while previous transaction was still open` failures are cascade fallout from that harness breakage rather than eight independent deal-machine regressions.

Affected tests:

- `convex/machines/__tests__/deal.integration.test.ts` — `Deal Integration — Happy Path (UC-DC-01) lawyerOnboarding.verified -> REPRESENTATION_CONFIRMED -> documentReview.pending`
- `convex/machines/__tests__/deal.integration.test.ts` — `Deal Integration — Happy Path (UC-DC-01) fundsTransfer.pending -> FUNDS_RECEIVED -> confirmed`
- `convex/machines/__tests__/deal.integration.test.ts` — `Deal Integration — Full Happy Path E2E full happy path: initiated -> confirmed with all effects verified`
- `convex/machines/__tests__/deal.integration.test.ts` — `Deal Integration — Terminal State Rejection any event from confirmed -> rejected`
- `convex/machines/__tests__/deal.integration.test.ts` — `Deal Integration — Terminal State Rejection any event from failed -> rejected`
- `convex/machines/__tests__/deal.integration.test.ts` — `Deal Integration — Concurrency (UC-DC-05) same event fired twice sequentially: first succeeds, second rejected`
- `convex/machines/__tests__/deal.integration.test.ts` — `Deal Integration — Prorate Boundary Conditions (T-011) happy path: writes seller and buyer prorate entries with correct amounts`
- `convex/machines/__tests__/deal.integration.test.ts` — `Deal Integration — Prorate Boundary Conditions (T-011) zero seller days: closing on last payment date — only buyer entry`

### Group U7: State-machine behavior changed, test did not

- Verdict: `test / harness issue`
- Explanation: the `collectionAttempt` machine now handles `FUNDS_SETTLED` in the `confirmed` state via `recordSettlementObserved`. The test still expects that event to be ignored with no action.

Affected tests:

- `convex/engine/machines/__tests__/collectionAttempt.test.ts` — `collectionAttempt machine confirmed state confirmed ignores FUNDS_SETTLED`

### Group U8: Execution test fixture blocks the intended rejection path

- Verdict: `test / harness issue`
- Explanation: the helper `seedPlanEntry` now enforces same-mortgage obligations up front, so this test never reaches the execution-layer mixed-handoff rejection it was written to assert. The failure is in test setup, not in the execution code path under test.

Affected tests:

- `convex/payments/collectionPlan/__tests__/execution.test.ts` — `executePlanEntry rejects plan entries with mixed obligation handoff context`

### Group U9: Legacy collection-rule fallback expectations are stale

- Verdict: `test / harness issue`
- Explanation: the current rule contract reads typed `config` from the schema and does not preserve the old `parameters` fallback behavior these tests assert.

Affected tests:

- `convex/payments/collectionPlan/__tests__/ruleContract.test.ts` — `collection rule contract falls back to defaults when legacy schedule parameters are invalid`
- `convex/payments/collectionPlan/__tests__/ruleContract.test.ts` — `collection rule contract falls back to defaults when legacy retry parameters are invalid`

### Group U10: Transfer-reconciliation behavior intentionally changed

- Verdict: `test / harness issue`
- Explanation: `transferReconciliationCron.ts` now escalates confirmed-without-ledger defects instead of silently retriggering them. The tests still assert the previous self-healing behavior.

Affected tests:

- `convex/payments/cashLedger/__tests__/transferReconciliation.test.ts` — `retriggerTransferConfirmation self-healing retries on first attempt`
- `convex/payments/cashLedger/__tests__/transferReconciliation.test.ts` — `retriggerTransferConfirmation self-healing escalates to SUSPENSE after max retries`
- `convex/payments/cashLedger/__tests__/transferReconciliation.test.ts` — `retriggerTransferConfirmation self-healing escalates outbound transfer to SUSPENSE with LENDER_PAYABLE credit`

### Group U11: Webhook fixtures are missing now-required transfer context

- Verdict: `test / harness issue`
- Explanation: the failing webhook seeds omit fields that the current settlement posting path requires. One fixture lacks `lenderId`; the other lacks `mortgageId`. Those are stale/incomplete test fixtures, not evidence that the webhook handlers themselves regressed.

Affected tests:

- `convex/payments/webhooks/__tests__/eftVopayWebhook.test.ts` — `processVoPayWebhook for eft_vopay processes outbound EFT settlement through the shared VoPay mutation`
- `convex/payments/webhooks/__tests__/vopayWebhook.test.ts` — `processVoPayWebhook integration marks PAD webhook processed, links transferRequestId, and confirms the transfer`

### Group U12: Transfer settlement posting model changed, test did not

- Verdict: `test / harness issue`
- Explanation: `convex/engine/effects/transfer.ts` now posts the authoritative cash-ledger entry on the transfer itself, while the collection attempt remains the business traceability object. The test still expects zero transfer-linked journal entries.

Affected tests:

- `convex/payments/transfers/__tests__/collectionAttemptReconciliation.integration.test.ts` — `collection attempt reconciliation for attempt-linked inbound transfers publishTransferConfirmed settles the linked collection attempt and leaves inbound cash posting on the obligation path`

### Group U13: Hash-chain tests use outdated journal shapes

- Verdict: `test / harness issue`
- Explanation: the current hash-chain helpers require richer journal data (`effectiveDate`, `eventId`, `eventCategory`, `sequenceNumber`, and related fields). These tests still seed older minimal shapes and fail before the reconciliation behavior under test is meaningfully exercised.

Affected tests:

- `src/test/convex/engine/hash-chain-reconciliation.test.ts` — `hash-chain and reconciliation builds auditTrail insert args with serialized metadata`
- `src/test/convex/engine/hash-chain-reconciliation.test.ts` — `hash-chain and reconciliation returns only the broken subset when healthy and tampered entities coexist`
- `src/test/convex/engine/hash-chain-reconciliation.test.ts` — `hash-chain and reconciliation reconciles across page boundaries for both Layer 1 and Layer 2 scans`

## Playwright

### Group E1: Audit & Traceability demo is publicly routed but backed by auth-protected queries

- Verdict: `implementation / regression`
- Explanation: the route layout at `src/routes/demo/audit-traceability/route.tsx` is public and linked from the main demo navigation, but the backing queries in `convex/demo/auditTraceability.ts` (`listMortgages`, `getAuditEvents`, `verifyChain`, `getOutboxStatus`) are `authedQuery`. The result is a public page that renders, then fails to load its data for anonymous users.

Affected tests:

- `audit-traceability.spec.ts` — `Audit & Traceability — Layout › tabs navigate between pages`
- `audit-traceability.spec.ts` — `Audit & Traceability — Transfers › shows empty state and seed button`
- `audit-traceability.spec.ts` — `Audit & Traceability — Transfers › seed data populates mortgages`
- `audit-traceability.spec.ts` — `Audit & Traceability — Transfers › create mortgage with PII fields`
- `audit-traceability.spec.ts` — `Audit & Traceability — Transfers › full transfer lifecycle: initiate → approve → complete`
- `audit-traceability.spec.ts` — `Audit & Traceability — Transfers › reject a transfer`
- `audit-traceability.spec.ts` — `Audit & Traceability — Transfers › traced lifecycle creates mortgage with all spans`
- `audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › renders mortgage selector buttons`
- `audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › selecting a mortgage shows chain verification result`
- `audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › event timeline shows hash chain data`
- `audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › PII fields are omitted in sanitized state`
- `audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › chain verification succeeds for valid chain`
- `audit-traceability.spec.ts` — `Audit & Traceability — Hash Chain › JSON export button is available for verified chain`
- `audit-traceability.spec.ts` — `Audit & Traceability — Audit Trail › renders query controls with resource/actor toggle`
- `audit-traceability.spec.ts` — `Audit & Traceability — Audit Trail › query by resource shows results for a mortgage`
- `audit-traceability.spec.ts` — `Audit & Traceability — Audit Trail › switching to actor mode shows actor input`
- `audit-traceability.spec.ts` — `Audit & Traceability — Audit Trail › query by actor returns results for demo-anonymous`
- `audit-traceability.spec.ts` — `Audit & Traceability — Audit Trail › critical events section renders`
- `audit-traceability.spec.ts` — `Audit & Traceability — Audit Trail › rejecting a transfer shows a critical event`
- `audit-traceability.spec.ts` — `Audit & Traceability — Pipeline › shows pending/emitted/failed/latency status cards`
- `audit-traceability.spec.ts` — `Audit & Traceability — Pipeline › shows emission progress bar`
- `audit-traceability.spec.ts` — `Audit & Traceability — Pipeline › emit pending events button works`
- `audit-traceability.spec.ts` — `Audit & Traceability — Pipeline › 5-layer defense-in-depth is displayed`
- `audit-traceability.spec.ts` — `Audit & Traceability — Pipeline › emitting reduces pending count`
- `audit-traceability.spec.ts` — `Audit & Traceability — Access Log › renders access log page with header`
- `audit-traceability.spec.ts` — `Audit & Traceability — Access Log › shows access entries after visiting other audit pages`
- `audit-traceability.spec.ts` — `Audit & Traceability — Access Log › access entries show actor and page info`
- `audit-traceability.spec.ts` — `Audit & Traceability — Report › renders compliance report with summary cards`
- `audit-traceability.spec.ts` — `Audit & Traceability — Report › shows all five control sections`
- `audit-traceability.spec.ts` — `Audit & Traceability — Report › control cards show regulatory standard references`
- `audit-traceability.spec.ts` — `Audit & Traceability — Report › hash chain control lists all entities with pass/fail`
- `audit-traceability.spec.ts` — `Audit & Traceability — Report › PII sanitization control lists omitted fields`
- `audit-traceability.spec.ts` — `Audit & Traceability — Report › outbox delivery shows pipeline metrics`
- `audit-traceability.spec.ts` — `Audit & Traceability — Report › download JSON button is present`
- `audit-traceability.spec.ts` — `Audit & Traceability — Report › report shows PASS status for hash chain integrity with valid data`
- `audit-traceability.spec.ts` — `Audit & Traceability — Report › report shows PASS for component isolation`
- `audit-traceability.spec.ts` — `Audit & Traceability — Report › generated timestamp is recent`
- `audit-traceability.spec.ts` — `Audit & Traceability — Integration › create mortgage → verify hash chain → check audit trail → emit`

### Group E2: Ownership Ledger demo has the same public-route/auth-query mismatch

- Verdict: `implementation / regression`
- Explanation: `src/routes/demo/convex-ledger.tsx` is public, but the data and write paths in `convex/demo/ledger.ts` are all `authedQuery` / `authedMutation`. The page falls into a session-expired/unauthorized error state for anonymous Playwright runs instead of rendering the public demo.

Affected tests:

- `convex-ledger.spec.ts` — `Ledger Demo — Layout › renders page title and description`
- `convex-ledger.spec.ts` — `Ledger Demo — Layout › shows controls card with seed button`
- `convex-ledger.spec.ts` — `Ledger Demo — Layout › shows demo- prefix help text`
- `convex-ledger.spec.ts` — `Ledger Demo — Seed Data › seed button populates mortgages and journal`
- `convex-ledger.spec.ts` — `Ledger Demo — Seed Data › seed is idempotent — shows message if data exists`
- `convex-ledger.spec.ts` — `Ledger Demo — Mortgage Cards › Greenfield mortgage shows correct investor positions`
- `convex-ledger.spec.ts` — `Ledger Demo — Mortgage Cards › Riverside mortgage shows correct positions`
- `convex-ledger.spec.ts` — `Ledger Demo — Mortgage Cards › invariant badges show valid state (green check)`
- `convex-ledger.spec.ts` — `Ledger Demo — Mortgage Cards › treasury balance shown for each mortgage`
- `convex-ledger.spec.ts` — `Ledger Demo — Transfers › transfer form has all required fields`
- `convex-ledger.spec.ts` — `Ledger Demo — Transfers › execute a share transfer between investors`
- `convex-ledger.spec.ts` — `Ledger Demo — Transfers › minimum position help text visible`
- `convex-ledger.spec.ts` — `Ledger Demo — Issue Shares › issue tab shows correct form fields`
- `convex-ledger.spec.ts` — `Ledger Demo — Issue Shares › issue shares to a new investor from treasury`
- `convex-ledger.spec.ts` — `Ledger Demo — Redeem Shares › redeem tab shows correct form fields`
- `convex-ledger.spec.ts` — `Ledger Demo — Redeem Shares › redeem shares from an investor back to treasury`
- `convex-ledger.spec.ts` — `Ledger Demo — Journal Log › journal log table is visible with entries`
- `convex-ledger.spec.ts` — `Ledger Demo — Journal Log › journal has correct column headers`
- `convex-ledger.spec.ts` — `Ledger Demo — Journal Log › journal entries show MORTGAGE MINTED and SHARES ISSUED for seed data`
- `convex-ledger.spec.ts` — `Ledger Demo — Journal Log › seed entries are tagged with seed source badge`
- `convex-ledger.spec.ts` — `Ledger Demo — Cleanup › cleanup removes all demo data`
- `convex-ledger.spec.ts` — `Ledger Demo — Cleanup › cleanup button is disabled when no data exists`
- `convex-ledger.spec.ts` — `Ledger Demo — Full Lifecycle › seed → transfer → issue → redeem → cleanup`
- `convex-ledger.spec.ts` — `Ledger Demo — Error Handling › transfer button is disabled when form is incomplete`
- `convex-ledger.spec.ts` — `Ledger Demo — Error Handling › issue button is disabled when form is incomplete`
- `convex-ledger.spec.ts` — `Ledger Demo — Error Handling › redeem button is disabled when form is incomplete`

### Group E3: Governed Transitions selectors are stale/ambiguous

- Verdict: `test / harness issue`
- Explanation: these failures come from locator ambiguity and stale UI assumptions, not from the state machine itself. The clearest example is `getByText("Create Application")` now matching both the card title and the button.

Affected tests:

- `governed-transitions.spec.ts` — `Governed Transitions — Layout › tabs navigate between pages`
- `governed-transitions.spec.ts` — `Governed Transitions — UC-1: Create Entity › fill in label and loan amount, create entity, verify it appears with draft status`
- `governed-transitions.spec.ts` — `Governed Transitions — UC-2: Valid Transition › create entity with applicant name, click SUBMIT, verify status changes to submitted`
- `governed-transitions.spec.ts` — `Governed Transitions — UC-3: Invalid Transition › create entity in draft, send APPROVE (invalid from draft), verify status remains draft, check journal for rejection`
- `governed-transitions.spec.ts` — `Governed Transitions — T-045A: Journal Read-Only › journal page has filter controls but no mutation buttons`
- `governed-transitions.spec.ts` — `Governed Transitions — T-045B: Machine Read-Only › machine page renders visualization and transition table but no mutation buttons`
- `governed-transitions.spec.ts` — `Governed Transitions — T-045C: Reactive Cross-Surface Updates › successful transition appears in journal`
- `governed-transitions.spec.ts` — `Governed Transitions — T-045C: Reactive Cross-Surface Updates › rejected transition appears in journal with entity staying in original state`

### Group E4: Document Engine tests are using the wrong auth harness

- Verdict: `test / harness issue`
- Explanation: `src/routes/demo/document-engine/route.tsx` explicitly guards the entire Document Engine behind `guardFairLendAdminWithPermission("document:review")`. These tests run in the unauthenticated `chromium` project and get redirected to AuthKit / the sign-in page, so the failures are harness/auth setup issues.

Affected tests:

- `document-engine/navigation.spec.ts` — `Document Engine - Navigation & Layout › layout renders with page title and navigation`
- `document-engine/navigation.spec.ts` — `Document Engine - Navigation & Layout › dashboard shows stat cards and getting started guide`
- `document-engine/navigation.spec.ts` — `Document Engine - Navigation & Layout › can navigate to library page`
- `document-engine/navigation.spec.ts` — `Document Engine - Navigation & Layout › can navigate to variables page`
- `document-engine/navigation.spec.ts` — `Document Engine - Navigation & Layout › can navigate to templates page`
- `document-engine/navigation.spec.ts` — `Document Engine - Navigation & Layout › can navigate to groups page`
- `document-engine/navigation.spec.ts` — `Document Engine - Navigation & Layout › can navigate to generate page`
- `document-engine/variables.spec.ts` — `Document Engine - System Variables › variables page renders with heading and add button`
- `document-engine/variables.spec.ts` — `Document Engine - System Variables › create dialog has all expected form elements`
- `document-engine/variables.spec.ts` — `Document Engine - System Variables › can create a string variable and see it in the list`
- `document-engine/variables.spec.ts` — `Document Engine - System Variables › can create a currency variable with correct formatting`
- `document-engine/variables.spec.ts` — `Document Engine - System Variables › create button is disabled without required fields`
- `document-engine/variables.spec.ts` — `Document Engine - System Variables › shows error for invalid key format`
- `document-engine/groups.spec.ts` — `Document Engine - Template Groups › groups page renders with heading and create button`
- `document-engine/groups.spec.ts` — `Document Engine - Template Groups › create dialog has name and description fields`
- `document-engine/groups.spec.ts` — `Document Engine - Template Groups › can create a group and see it in the list`
- `document-engine/groups.spec.ts` — `Document Engine - Template Groups › can expand a group to see its details`
- `document-engine/groups.spec.ts` — `Document Engine - Template Groups › create group button is disabled without name`
- `document-engine/templates.spec.ts` — `Document Engine - Templates › templates page renders with heading`
- `document-engine/templates.spec.ts` — `Document Engine - Templates › new template button is enabled when base PDFs exist`
- `document-engine/templates.spec.ts` — `Document Engine - Templates › create dialog shows available base PDFs`
- `document-engine/templates.spec.ts` — `Document Engine - Templates › can create a template and see it with Draft Only status`
- `document-engine/templates.spec.ts` — `Document Engine - Templates › can navigate to designer from template card`
- `document-engine/library.spec.ts` — `Document Engine - Base PDF Library › library page renders with heading and upload button`
- `document-engine/library.spec.ts` — `Document Engine - Base PDF Library › upload dialog opens with correct form elements`
- `document-engine/library.spec.ts` — `Document Engine - Base PDF Library › can upload a PDF and see it in the library`
- `document-engine/library.spec.ts` — `Document Engine - Base PDF Library › shows empty state or PDF cards after data loads`
- `document-engine/generate.spec.ts` — `Document Engine - Generate Page › generate page renders with mode toggle and source selector`
- `document-engine/generate.spec.ts` — `Document Engine - Generate Page › can toggle between template and group mode`
- `document-engine/generate.spec.ts` — `Document Engine - Generate Page › generate button not shown before selection`
- `document-engine/designer.spec.ts` — `Document Engine - Template Designer › designer page loads with template info and toolbar`
- `document-engine/workflow.spec.ts` — `Document Engine - Full Workflow › 1. upload a base PDF to the library`

### Group E5: Demo listings detail routes are not rendering expected pages

- Verdict: `implementation / regression`
- Explanation: the original stale slug was a real test issue, but follow-up browser verification showed both known and unknown `/demo/listings/$listingid` routes rendering only the app shell with sign-in links instead of the detail page or the route-level not-found UI. That makes this a route/rendering problem in the app, not just a stale spec.

Affected tests:

- `demo-listings.spec.ts` — `Demo listing detail page › renders a known listing and supports desktop interactions`
- `demo-listings.spec.ts` — `Demo listing detail page › renders a not-found state for unknown listings`
- `demo-listings.spec.ts` — `Demo listing detail page › renders the mobile composition`

### Group E6: WorkOS profile tests use non-unique selectors

- Verdict: `test / harness issue`
- Explanation: the page now renders the same email in multiple places, so `getByText("connor@fairlend.ca")` is a strict-mode violation. The tests need stronger selectors.

Affected tests:

- `auth/login.spec.ts` — `authenticated user sees profile on workos demo page`
- `auth/login.spec.ts` — `sign out clears session`

### Group E7: RBAC role assertions are using stale DOM assumptions

- Verdict: `test / harness issue`
- Explanation: the tests assume a `locator("text=Role").locator("..").first()` structure that no longer reliably contains the rendered role badge. This is selector drift, not a role-resolution regression.

Affected tests:

- `rbac/admin.spec.ts` — `admin session shows admin role`
- `rbac/member.spec.ts` — `member session shows member role`

### Group E8: Onboarding "member" fixture is no longer a member

- Verdict: `test / harness issue`
- Explanation: the saved storage state used by this spec resolves to an `admin` role at runtime. The error-context snapshot shows the page explicitly saying `You have the admin role`, so the test data/harness is stale.

Affected tests:

- `auth/onboarding.spec.ts` — `member submits a valid role request and sees the pending state`

### Group E9: `/sign-in` redirect expectation is stale

- Verdict: `test / harness issue`
- Explanation: the test waits for `workos.com`, but the current flow redirects to an AuthKit-hosted `*.authkit.app` URL. The route still redirects; the host-pattern assertion is outdated.

Affected tests:

- `auth/protected-routes.spec.ts` — `/sign-in redirects to WorkOS hosted page`

### Group E10: Simulation spec is brittle around settlement timing/error handling

- Verdict: `test / harness issue`
- Explanation: this failure does not show a domain exception from the simulation engine. The spec branches on a hard-coded 3-second success check and then assumes an error matching `/remaining balance \d+/` if success was not visible quickly enough. The saved report shows neither branch matching cleanly, which points more to a brittle UI contract/timing assumption than to a confirmed simulation-core regression.

Affected tests:

- `simulation.spec.ts` — `Marketplace Simulation — Full Flow › runs the simulation from seed through settlement and cleanup`

### Group E11: AMPS offline-payments stage machine is not matching the test contract

- Verdict: `implementation / regression`
- Explanation: the test expects the lifecycle to advance to `outbound_pending_confirmation`, but the UI remains at `dispersal_ready`. That is a real behavior divergence in the product flow, not a selector or auth-harness problem.

Affected tests:

- `amps/offline-payments.spec.ts` — `AMPS offline payments e2e harness › runs the full offline collection lifecycle`
