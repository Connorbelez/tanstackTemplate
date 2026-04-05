# 08. Implement Balance Pre-Check Capability — Gap Analysis

> Spec: https://www.notion.so/337fc1b440248194a6e6dd923b82acc9
> Linked plan: https://www.notion.so/337fc1b4402481268745cde3d6fd2f5b
> Re-fetched against Notion on 2026-04-04

## Outcome
Page 08 is implemented with no blocking spec gaps remaining.

## What shipped
- A canonical typed `balance_pre_check` rule contract replaced the page-07 placeholder.
- `collectionPlanEntries` now persist balance-pre-check decision snapshots, reasons, signal source, rule linkage, evaluation timestamps, and defer timing.
- AMPS evaluates balance pre-checks before `collectionAttempt` creation in the canonical `executePlanEntry` spine.
- The first shipping signal source is repo-grounded recent failed inbound borrower transfers, with `NSF` / `insufficient_funds`-style heuristics.
- `defer`, `suppress`, and `require_operator_review` block attempt creation while keeping the plan entry visible and auditable.
- The due runner skips deferred entries until their next evaluation time and does not thrash them across immediate reruns.
- Transfer-domain bank-account validation remains separate for entries that proceed.

## Requirement coverage
- REQ-1: Satisfied. Balance pre-check lives under `convex/payments/collectionPlan/` and runs inside Collection Plan execution, not provider adapters.
- REQ-2: Satisfied. Blocked execution mutates only plan-entry strategy metadata; obligations remain unchanged.
- REQ-3: Satisfied. Proceeding entries still flow into the existing Payment Rails validation and transfer handoff path.
- REQ-4: Satisfied. Explicit outcomes are encoded as `proceed`, `defer`, `suppress`, and `require_operator_review`.
- REQ-5: Satisfied. No `collectionAttempts` row is created when pre-check blocks execution.
- REQ-6: Satisfied. Reason code/detail, signal source, rule id, and timing metadata are persisted on the plan entry.
- REQ-7: Satisfied. Deferred and review-blocked entries remain visible in AMPS state instead of disappearing.
- REQ-8: Satisfied. The first version uses recent failed inbound transfer history rather than fake provider-side balance truth.
- REQ-9: Satisfied. No new admin UI was required; the backend now persists the inspection data that pages 12 and 13 can surface later.
- REQ-10: Satisfied. Contract and regression tests cover proceed, defer, suppress, review-required, and runner replay behavior.

## Residual scope notes
- Operator UI is intentionally deferred to pages 12 and 13. Page 08 now stores the data those pages need.
- The first signal source is heuristic, not a real-time balance integration. This matches the current repo and Notion plan.
- Suppressed and review-required entries remain blocked until later admin surfaces or follow-up flows provide override/re-attempt behavior.

## Verification
- `bun run test convex/payments/__tests__/rules.test.ts src/test/convex/seed/seedPaymentData.test.ts convex/payments/collectionPlan/__tests__/engine.test.ts convex/payments/collectionPlan/__tests__/execution.test.ts convex/payments/collectionPlan/__tests__/runner.test.ts src/test/convex/payments/crossEntity.test.ts src/test/convex/payments/endToEnd.test.ts`
- `bun check`
- `bunx convex codegen`
- `bun typecheck`

## Tooling notes
- GitNexus impact analysis was attempted for the shared execution/rule symbols but the current index did not resolve `executePlanEntry`, `classifyExecutionEligibility`, `getDuePlannedEntries`, or `seedCollectionRulesImpl`. I compensated with focused regression coverage and final diff review.
- The verification slice still emits the repo’s existing stderr noise around missing `BORROWER_RECEIVABLE` accounts and absent active positions for dispersal creation. Those are pre-existing test-environment conditions, not page-08 regressions.
