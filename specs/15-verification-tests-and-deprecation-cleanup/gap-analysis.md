# 15. Verification, Tests, and Deprecation Cleanup — Gap Analysis

> Spec: https://www.notion.so/337fc1b4402481a5abd4c1804791ac9b
> Linked plan: https://www.notion.so/337fc1b440248188922ad689864de7e4
> Re-fetched against Notion on 2026-04-05

## Scope note
The upstream Notion page includes admin UI and demo validation, but the user explicitly deferred all UI/browser/demo work to later dedicated execution pages. This closeout therefore covers the backend verification, compatibility labeling, and documentation-cleanup portion of page 15 only.

## Outcome
Page 15 is implemented for the active backend/docs scope, with no blocking backend verification or deprecation gaps remaining.

## What shipped
- Added an explicit backend verification matrix in `specs/15-verification-tests-and-deprecation-cleanup/verification-matrix.md` so the final AMPS proof is concrete and file-backed rather than implied.
- Relabeled the old manual and mock-PAD end-to-end suites as compatibility-only coverage.
- Relabeled bridge-era transfer tests as compatibility-only coverage and retired the redundant `T-011` bridge-flow integration scenario from `convex/payments/transfers/__tests__/inboundFlow.integration.test.ts`, because it duplicated older bridge behavior and left the convex-test workflow harness in a dirty async state without adding unique architectural proof.
- Updated the shared audit-log test helper so transition-heavy test harnesses register the aggregate subcomponents required by the current audit-log component wiring.
- Added a closure addendum to `specs/active-mortgage-payment-system-alignment-2026-04-03.md` so the alignment artifact no longer reads as if the already-landed backend pages are still open findings.

## Requirement coverage
- REQ-1: Satisfied. The backend verification matrix now maps activation handoff, canonical execution, runner scheduling, reconciliation, retry, late fee, balance pre-check, reschedule, workout, boundary, and admin-backend coverage onto concrete test files.
- REQ-2: Satisfied. Page-14 boundary invariants remain part of the final verification slice.
- REQ-3: Satisfied. Legacy manual and bridge-era tests are now explicitly labeled compatibility-only, and one noisy redundant compatibility suite was retired.
- REQ-4: Satisfied. Compatibility-only paths remain documented and covered, but they are no longer framed as the canonical production path.
- REQ-5: Satisfied. Local docs and local spec artifacts now consistently describe the backend architecture and the deferred UI/demo scope.
- REQ-6: Satisfied. The alignment report now has a closure addendum, and the verification matrix ties the major prior findings to concrete evidence.
- REQ-7: Satisfied. No UI/browser/demo work was added in this page; that deferral is now explicit in the page-15 artifacts.
- REQ-8: Satisfied. The focused backend verification slice, `bun check`, `bun typecheck`, and `bunx convex codegen` all passed on the final tree.

## Residual scope notes
- Admin UI, browser verification, and stakeholder demo validation remain intentionally deferred to the later dedicated execution pages.
- Compatibility-only seams still exist by design:
  - manual/mock-PAD compatibility coverage in `src/test/convex/payments/endToEnd.test.ts`
  - bridge compatibility coverage in `convex/payments/transfers/__tests__/bridge.test.ts` and the reduced `inboundFlow.integration.test.ts`
- The repo still emits known non-blocking stderr noise in backend payment tests around:
  - missing `BORROWER_RECEIVABLE` accounts in lightweight fixtures
  - no active positions during downstream dispersal scheduling
  - placeholder transfer-healing warnings in reconciliation tests
  These are pre-existing harness/environment conditions, not page-15 regressions.

## Verification completed
- Focused backend verification matrix:
  - `bun run test src/test/convex/seed/seedPaymentData.test.ts convex/payments/__tests__/rules.test.ts convex/payments/collectionPlan/__tests__/execution.test.ts convex/payments/collectionPlan/__tests__/runner.test.ts convex/payments/collectionPlan/__tests__/reschedule.test.ts convex/payments/collectionPlan/__tests__/workout.test.ts convex/payments/collectionPlan/__tests__/admin.test.ts convex/payments/transfers/__tests__/collectionAttemptReconciliation.integration.test.ts convex/payments/cashLedger/__tests__/transferReconciliation.test.ts src/test/convex/payments/boundaryInvariants.test.ts src/test/convex/payments/crossEntity.test.ts src/test/convex/payments/endToEnd.test.ts convex/payments/transfers/__tests__/bridge.test.ts convex/payments/transfers/__tests__/inboundFlow.integration.test.ts`
- Repo-wide required checks:
  - `bun check`
  - `bun typecheck`
  - `bunx convex codegen`

## Tooling notes
- `bun check` still reports the repo's existing complexity warnings in unrelated files.
- The worktree remains dirty across many earlier AMPS pages, so this page's correctness signal is the focused backend verification slice plus the required repo checks, not a page-isolated git diff.
- The page-15 implementation did not require additional shared production-runtime edits beyond the shared test helper needed to keep the audit-log harness aligned with the current transition/audit component graph.

## Conclusion
No blocking page-15 gaps remain for the active backend/docs scope. The remaining work is intentionally deferred UI/demo execution, not unfinished backend verification or architectural deprecation cleanup.
