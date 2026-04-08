# 13. Build Active Mortgage Payment System Demo Workspace (/demo) — Gap Analysis

Checked against the live Notion spec and linked implementation plan on April 8, 2026.

## What shipped
- The AMPS demo workspace now lives under `/demo/amps` and does not depend on `/admin` routes.
- The demo uses the canonical collection admin backend contracts from `convex/payments/collectionPlan/admin.ts` plus narrowly scoped demo orchestration in `convex/demo/amps.ts`.
- The demo includes dedicated surfaces for:
  - `/demo/amps`
  - `/demo/amps/rules`
  - `/demo/amps/collection-plan`
  - `/demo/amps/collection-attempts`
  - `/demo/amps/mortgages/$mortgageId/payments`
- The mortgage workspace clearly separates obligation truth, strategy context, collection plan, execution history, and workout lifecycle.
- Governed demo actions are wired to real backend behavior through canonical mutations and admin wrappers:
  - manual execute
  - reschedule
  - workout create, activate, complete, cancel
  - rule create and update
- Deterministic scenario preparation exists and produces the intended AMPS story matrix from backend truth:
  - healthy
  - overdue
  - failed retry
  - review required
  - workout backed
  - suppressed

## Verification completed
- `bunx playwright test e2e/amps --project amps-demo` passed.
- `bun check` passed with the repo's existing unrelated warnings.
- `bun typecheck` passed.
- `bunx convex codegen` passed.

## Remaining gaps
- Full story-matrix e2e coverage is still incomplete. The current Playwright slice proves workspace navigation, layer-specific surfaces, deterministic prep, and one governed workout-exit flow, but it does not yet add dedicated browser tests for each scenario story in the matrix.
- Because of that, the page-13 task items for complete UC-5 story-walkthrough coverage and "all page-13 spec tests pass" remain open in `tasks.md`.
- Final visual polish and presentation hardening remain deferred to page 16 by design.
- The dev server still emits non-blocking `useRouter must be used inside a <RouterProvider>` warnings during startup in this repo. They did not block the AMPS demo or the Playwright run, but they remain unexplained.

## Conclusion
- Page 13 is implemented for the demo-workspace scope and is usable for stakeholder walkthroughs under `/demo/amps`.
- No blocking product or backend gaps remain for the page-13 demo workspace itself.
- The only material remaining work on this page is broader browser validation of the full scenario matrix and later polish/presentation cleanup owned by page 16.
