# 14. Preserve Mortgage Lifecycle and Ledger Boundaries — Gap Analysis

> Spec: https://www.notion.so/337fc1b440248188a5cbf191c15cb468
> Linked plan: https://www.notion.so/337fc1b4402481bda2baecfff1e18d5a
> Re-fetched against Notion on 2026-04-05

## Outcome
Page 14 is implemented with no blocking boundary gaps remaining for the shipped scope.

## What shipped
- Added focused backend regression coverage in `src/test/convex/payments/boundaryInvariants.test.ts` for obligation-driven mortgage lifecycle, strategy-only plan changes, strategy-agnostic cash posting, and workout boundary preservation.
- Tightened explicit ownership comments across the obligation, collection-attempt, transfer, workout, reschedule, and cash-ledger seams so future contributors can see where lifecycle and money meaning are supposed to live.
- Added a small runtime-safe journal-id fallback in `convex/engine/transition.ts` so shared transition tests and convex-test execution do not depend on ambient `crypto.randomUUID()` availability.

## Requirement coverage
- REQ-1: Satisfied. Mortgage delinquency/cure remains obligation-driven and the new regression file locks that behavior.
- REQ-2: Satisfied. Plan-entry reschedule/workout and attempt failure/initiation are verified not to mutate mortgage state directly.
- REQ-3: Satisfied. Ledger meaning remains obligation/transfer-driven; strategy state is not required to infer accrual or receipt semantics.
- REQ-4: Satisfied. Borrower cash posting stays in cash-ledger integrations and is documented there explicitly.
- REQ-5: Satisfied. Transfer/provider lifecycle ownership remains in transfer rails and transfer effects, with AMPS consuming only explicit linkage seams.
- REQ-6: Satisfied. Workout and reschedule are now explicitly documented and tested as future-strategy changes only.
- REQ-7: Satisfied. The highest-risk seams now carry boundary comments and clearer ownership wording.
- REQ-8: Satisfied. Focused regression coverage proves the boundary invariants instead of leaving them implicit.

## Residual scope notes
- This page intentionally hardens existing seams; it does not redesign the mortgage machine, remove the legacy bridge, or create import-level architecture enforcement.
- The legacy `emitPaymentReceived` bridge remains as compatibility behavior, but it is now more clearly fenced as non-canonical in the effect layer.
- Repo-wide final verification is intentionally deferred to the combined closeout after page 15, because the user asked to continue directly into the final verification/deprecation page.

## Verification completed so far
- Focused boundary regression:
  - `bun run test src/test/convex/payments/boundaryInvariants.test.ts`
- Wider boundary-adjacent regression slice:
  - `bun run test src/test/convex/payments/boundaryInvariants.test.ts src/test/convex/payments/crossEntity.test.ts convex/engine/effects/__tests__/transfer.test.ts convex/payments/collectionPlan/__tests__/reschedule.test.ts convex/payments/collectionPlan/__tests__/workout.test.ts src/test/convex/engine/transition.test.ts`

Known non-blocking verification noise:
- the slice still emits the repo's existing expected stderr around missing `BORROWER_RECEIVABLE` accounts, absent active positions, and hash-chain kill-switch logging in test harnesses, but the tests passed

## Tooling notes
- GitNexus impact analysis was run before the shared transition edit. `executeTransition` resolved as `HIGH` risk, so the code change there was intentionally minimal and runtime-only.
- `forwardObligationEventToMortgage` resolved as `LOW` risk.
- Several intended page-14 symbol lookups did not resolve cleanly in the current GitNexus index, including `emitPaymentReceived`, `emitObligationSettled`, and `publishTransferConfirmed`. I treated those as blind spots and compensated with focused regression coverage.
- `gitnexus_detect_changes(scope="all", repo="fairlendapp")` reported a critical-risk dirty worktree, but that reflects the already-accumulated multi-page payment realignment changes rather than a page-14-isolated branch.

## Conclusion
No blocking page-14 gaps remain. The remaining work is final repo-wide verification and deprecation/documentation convergence, which is the purpose of page 15 rather than an unfinished page-14 boundary task.
