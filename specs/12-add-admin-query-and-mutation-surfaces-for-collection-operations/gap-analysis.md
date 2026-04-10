# 12. Add Admin Query and Mutation Surfaces for Collection Operations — Gap Analysis

## Sources Re-Checked
- Notion spec: `https://www.notion.so/337fc1b440248119a4b9eb469e201b27`
- Linked implementation plan: `https://www.notion.so/337fc1b440248173af90ef4c753a8599`
- Re-fetched through the Notion connector during closeout on 2026-04-05. The live pages still match the shipped scope: dedicated collection admin surfaces, governed operator actions, structural RBAC, and stable backend contracts for page 13 / page 16 follow-on work.

## Implemented
- Added a dedicated collection-admin backend module instead of overloading the generic entity-table admin query path.
- Added admin query surfaces for collection rules, collection plan entries, collection attempts, and a mortgage-scoped collection operations summary.
- Added governed admin write surfaces for manual execution, reschedule, workout creation/activation, and typed rule creation/update.
- Kept admin writes routed through canonical collection-domain seams where those seams already existed.
- Added operator-facing projections for lineage, reason metadata, audit events, transfer linkage, reconciliation summaries, balance-precheck state, and workout ownership.
- Enforced admin access structurally through the shared fluent admin builders rather than UI-only gating.
- Added focused backend coverage for read contracts, governed mutation delegation, and non-admin rejection.

## Residual Scope
- This page ships the backend/admin contract only. The full operator UI remains downstream page-13 work.
- The admin workout surface only exposes operations already supported by the canonical workout module. Full workout lifecycle actions such as suspend, complete, cancel, or update are still future work from the workout domain itself.
- The first version favors stable operator-facing projections over full list filtering and pagination breadth. Additional list ergonomics can be added later without changing the current core contracts.
- No browser e2e was added because page 12 is backend contract work and the focused backend coverage proved the required behavior.

## Requirement Assessment

| Requirement | Status | Notes |
| --- | --- | --- |
| REQ-1 admin can inspect rules | Implemented | Dedicated rule list/detail queries expose typed config summaries, scope, status, authorship, and related audit context. |
| REQ-2 admin can inspect plan entries | Implemented | Plan-entry list/detail queries expose source, lineage, balance gate state, workout ownership, linked attempts, and audit metadata. |
| REQ-3 admin can inspect attempts | Implemented | Attempt list/detail queries expose lifecycle, transfer linkage, provider refs, reconciliation state, and upstream plan-entry context. |
| REQ-4 mortgage-scoped collection view exists | Implemented | Mortgage summary query returns rules, upcoming entries, recent attempts, and active/draft workout context. |
| REQ-5 admin actions route through governed domain seams | Implemented | Manual execute, reschedule, and workout actions delegate to canonical collection-plan modules; no admin-only shortcut path was added. |
| REQ-6 admin surfaces are structurally permissioned | Implemented | Surfaces use the shared admin builders and focused tests prove non-admin rejection. |
| REQ-7 reason/audit metadata is queryable | Implemented | Read models return operator-facing reasons, lineage, audit events, and reconciliation summaries. |
| REQ-8 contracts are stable for page 13 / demo | Implemented | Read/write shapes are explicit and collection-specific rather than raw-table passthroughs. |
| REQ-9 no raw DB manipulation path is introduced | Implemented for shipped scope | Admin wrappers delegate to canonical mutations/actions where those seams exist; rule management preserves the typed rule contract and audit logging. |
| REQ-10 backend verification proves behavior | Implemented | Focused backend tests cover the read contracts, mutation delegation, and RBAC boundary. |

## Verification Completed
- Focused page-12 admin contract tests passed:
  - `convex/payments/collectionPlan/__tests__/admin.test.ts`
- Wider collection-plan regression slice passed:
  - `convex/payments/collectionPlan/__tests__/admin.test.ts`
  - `convex/payments/collectionPlan/__tests__/execution.test.ts`
  - `convex/payments/collectionPlan/__tests__/reschedule.test.ts`
  - `convex/payments/collectionPlan/__tests__/workout.test.ts`
  - `convex/payments/collectionPlan/__tests__/runner.test.ts`
- `bun check` passed with the repo's existing complexity warnings.
- `bun typecheck` passed.
- `bunx convex codegen` passed.

Known non-blocking verification noise:
- the focused regression slice still emits the repo's existing expected stderr around missing `BORROWER_RECEIVABLE` accounts, absent active positions, and older payment-state warnings in downstream scheduled work, but the tests passed

## GitNexus
- Pre-edit `impact` lookups for the intended shared admin and collection-plan symbols did not resolve cleanly in the current index. I recorded that blind spot and used the documented fallback: focused regression coverage plus final diff review.
- `gitnexus_detect_changes(scope="all", repo="fairlendapp")` reported `risk_level: low`, `changed_files: 37`, and `affected_count: 0`.
- That detect-changes result still reflects the already-dirty multi-page payment worktree, not a page-12-only isolated branch, so the focused page-12 regression slice remains the more precise correctness signal for this task.

## Conclusion
No blocking page-12 gaps remain for the shipped backend/admin-contract scope. The remaining work is downstream UI consumption and future domain expansion, not missing core admin query or governed mutation surfaces.
