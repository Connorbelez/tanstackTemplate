# 10. Implement Workout Plan Capability — Gap Analysis

## Sources Re-Checked
- Notion spec: `https://www.notion.so/337fc1b4402481b59a5ecc19d8b22e13`
- Linked implementation plan: `https://www.notion.so/337fc1b44024814982a6dfdd0dca28d2`
- Re-fetched during closeout on 2026-04-05. The current Notion contract still matches the implementation described below; no new blocking drift was found.

## Implemented
- Added an explicit `workoutPlans` domain model with lifecycle status, rationale, strategy payload, mortgage scoping, actor attribution, and query indexes.
- Expanded `collectionPlanEntries` so workout-owned strategy is auditable via `source = "admin_workout"`, `workoutPlanId`, and supersession metadata.
- Added canonical admin-first workout functions for create, activate, and inspection.
- Implemented activation orchestration that supersedes future safe `planned` entries and creates replacement workout-owned entries without mutating obligations.
- Preserved workout ownership across downstream collection-plan features by carrying `workoutPlanId` through borrower/admin reschedule and retry scheduling.
- Added backend coverage for activation behavior, unchanged obligations, workout-owned entry invariants, and workout interaction rules with reschedule and retry.

## Residual Scope
- Full workout lifecycle exit flows are not implemented yet. `update`, `suspend`, `complete`, and `cancel` mutations remain future work.
- Because exit flows are not shipped, there is not yet a canonical "restore default scheduling after workout exit" behavior.
- Page 10 remains backend and minimal-query focused. Full operator UI is still deferred to later admin-surface pages.
- No separate schedule-rule engine overlay was added. The shipped first version relies on explicit workout activation ownership and entry supersession rather than an always-on workout rule in the scheduler.

## Requirement Assessment

| Requirement | Status | Notes |
| --- | --- | --- |
| REQ-1 workout is explicit strategy | Implemented | `workoutPlans` is a first-class domain model rather than hidden plan-entry edits. |
| REQ-2 lifecycle is auditable | Partial | Create and activate are queryable and audit-logged; exit/update flows remain unimplemented. |
| REQ-3 workout does not rewrite obligations | Implemented | Activation only changes future collection-plan entries. |
| REQ-4 workout alters future collection strategy | Implemented | Activation supersedes covered future entries and installs workout-owned replacements. |
| REQ-5 mortgage lifecycle remains obligation-driven | Implemented for shipped scope | No mortgage or obligation truth is mutated by workout activation; exit behavior remains future work. |
| REQ-6 interaction with retry/reschedule/late fees is explicit | Implemented for shipped scope | Reschedule and retry ownership are preserved; no workout-specific late-fee override was introduced. |
| REQ-7 operators can inspect rationale and scope | Implemented | Inspection queries expose workout metadata and linked plan-entry ownership. |
| REQ-8 workout-owned entries are auditable | Implemented | Source and lineage metadata are stored on the entries. |
| REQ-9 first version may ship admin-only | Implemented | Delivery is backend/admin-first. |
| REQ-10 verification proves boundary preservation | Implemented for shipped scope | Focused backend tests cover the page-10 boundary; no browser e2e was required. |

## Verification Completed
- Focused page-10 regression slice passed:
  - `convex/payments/collectionPlan/__tests__/workout.test.ts`
  - `convex/payments/collectionPlan/__tests__/reschedule.test.ts`
  - `convex/payments/collectionPlan/__tests__/runner.test.ts`
  - `convex/payments/__tests__/rules.test.ts`
- `bun check` passed.
- `bun typecheck` passed.
- `bunx convex codegen` passed.
- GitNexus impact lookups for the targeted shared collection-plan files did not resolve cleanly in the current index, so focused regression coverage was used instead.
- GitNexus `detect_changes(scope="all", repo="fairlendapp")` reported `risk_level: low`.

## Conclusion
No blocking page-10 gaps remain for the shipped admin-first backend scope. The main remaining work is lifecycle completion and downstream operator UI, not correctness of the new workout activation seam.
