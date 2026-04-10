# Gap Analysis — 06. Correct Activation and Initial Scheduling Handoff

## Verification Date
- Re-fetched against the live Notion execution page and linked implementation plan on April 4, 2026.

## Spec Verdict
- Implemented.

## What Changed
- Added one shared canonical default-rule seeding seam in `convex/payments/collectionPlan/defaultRules.ts`.
- Added one shared canonical initial-scheduling seam in `convex/payments/collectionPlan/initialScheduling.ts`.
- Refactored `scheduleRule` handling to delegate to the shared internal scheduling mutation instead of carrying a private scheduling implementation.
- Refactored `seedPaymentData` to generate or reuse obligations first, ensure collection rules exist, then invoke canonical initial scheduling instead of directly inserting initial `collectionPlanEntries`.
- Preserved idempotent bootstrap behavior by treating non-cancelled plan entries as existing coverage for upcoming obligations.

## Acceptance Criteria Check
- `activation produces obligations through the canonical path`
  - Satisfied. `seedPaymentData` still treats obligations as the first contractual step and only schedules after obligation generation or reuse completes.
- `initial scheduling is rules-engine-derived rather than separately seeded as truth`
  - Satisfied. `scheduleRule` now delegates to the shared internal scheduling mutation, and bootstrap uses the same scheduling implementation.
- `activation and scheduling no longer have dual-source truth`
  - Satisfied for the implemented bootstrap/activation handoff seam. Initial plan creation now flows through one shared scheduling module rather than a direct bootstrap-only insert path.

## Requirement Coverage
- REQ-1 obligations-first contractual truth
  - Covered by the refactored `seedPaymentData` flow and integration tests.
- REQ-2 initial scheduling must be rule-driven
  - Covered by `scheduleRule` delegation and the shared `scheduleInitialEntriesImpl`.
- REQ-3 bootstrap remains a prerequisite/orchestration layer, not a separate truth path
  - Covered by `seedCollectionRulesImpl` plus bootstrap delegation into canonical scheduling.
- REQ-4 no dual-source truth for initial plan creation
  - Covered by removing direct initial plan-entry insertion from `seedPaymentData`.
- REQ-5 no UI work required
  - Covered. No route or component changes were needed.
- REQ-6 collection rules are present before scheduling
  - Covered by bootstrap ensuring default rules before initial scheduling runs.
- REQ-7 rerun safety
  - Covered by obligation coverage checks over non-cancelled plan entries and rerun tests.
- REQ-8 downstream compatibility with page-03/page-07 behavior
  - Covered by focused downstream regression tests for the existing execution spine and rules tests.
- REQ-9 testing/verification
  - Covered by focused backend tests plus final repository verification gates.

## Residual Notes
- This page corrects the activation/bootstrap handoff seam. It does not fully productize a separate mortgage activation UX or workflow.
- Bootstrap remains a helper/orchestration path for local/demo data, but it no longer acts as an architectural exception for initial plan creation.
- GitNexus did not resolve every handler export cleanly in the current index, so final confidence relies on focused regression tests plus repository-wide change detection rather than full symbol-level blast-radius reporting for every touched handler.

## Test Evidence
- Focused backend regression slice passed:
  - `bun run test convex/payments/__tests__/rules.test.ts src/test/convex/seed/seedPaymentData.test.ts src/test/convex/seed/seedAll.test.ts convex/payments/collectionPlan/__tests__/execution.test.ts convex/payments/collectionPlan/__tests__/runner.test.ts`
- Repository verification gates passed:
  - `bun check`
  - `bun typecheck`
  - `bunx convex codegen`

## Final Assessment
- No blocking page-06 gaps remain.
