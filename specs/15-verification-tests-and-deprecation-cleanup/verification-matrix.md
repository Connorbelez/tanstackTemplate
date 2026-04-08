# 15. Verification, Tests, and Deprecation Cleanup — Verification Matrix

This matrix locks the backend-only page-15 scope. UI, browser, and demo
verification are intentionally deferred to later dedicated execution pages.

| Verification target | Primary evidence | Notes |
| --- | --- | --- |
| Activation and initial scheduling handoff | `src/test/convex/seed/seedPaymentData.test.ts`, `convex/payments/__tests__/rules.test.ts` | Proves obligations-first bootstrap and shared scheduling seam behavior. |
| Canonical plan-entry execution contract | `convex/payments/collectionPlan/__tests__/execution.test.ts` | Covers eligibility, replay safety, attempt creation, balance pre-check, and transfer handoff. |
| Scheduler-owned due runner | `convex/payments/collectionPlan/__tests__/runner.test.ts` | Proves due entry selection, replay-safe reruns, durable failure/retry behavior, and defer handling. |
| Transfer reconciliation and cash posting | `convex/payments/transfers/__tests__/collectionAttemptReconciliation.integration.test.ts`, `convex/payments/cashLedger/__tests__/transferReconciliation.test.ts` | Proves canonical settlement/failure/cancel/reversal reconciliation and attempt-owned cash semantics. |
| Retry and late-fee rule behavior | `convex/payments/__tests__/rules.test.ts`, `src/test/convex/payments/endToEnd.test.ts`, `src/test/convex/payments/crossEntity.test.ts` | Covers retry scheduling, overdue-driven rule effects, and obligation-driven late-fee behavior. |
| Balance pre-check behavior | `convex/payments/collectionPlan/__tests__/execution.test.ts`, `convex/payments/collectionPlan/__tests__/runner.test.ts` | Covers proceed, defer, suppress, review-required, and no-thrash reruns. |
| Borrower reschedule capability | `convex/payments/collectionPlan/__tests__/reschedule.test.ts` | Proves guarded replacement creation and lineage preservation. |
| Workout strategy capability | `convex/payments/collectionPlan/__tests__/workout.test.ts` | Proves workout-owned future scheduling and supersession behavior. |
| Mortgage lifecycle and ledger boundaries | `src/test/convex/payments/boundaryInvariants.test.ts`, `src/test/convex/payments/crossEntity.test.ts`, `convex/engine/effects/__tests__/transfer.test.ts` | Locks obligation-driven mortgage lifecycle and strategy-agnostic cash/transfer ownership. |
| Admin/operator backend workflows | `convex/payments/collectionPlan/__tests__/admin.test.ts` | Proves admin reads, governed write delegation, and RBAC without requiring UI work. |
| Compatibility-only bridge/manual paths | `src/test/convex/payments/endToEnd.test.ts`, `convex/payments/transfers/__tests__/bridge.test.ts`, `convex/payments/transfers/__tests__/inboundFlow.integration.test.ts` | These suites remain only as compatibility coverage and are explicitly labeled that way. |
