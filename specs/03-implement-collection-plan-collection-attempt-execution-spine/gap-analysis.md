# 03. Implement Collection Plan -> Collection Attempt Execution Spine — Gap Analysis

Re-fetched against the canonical Notion sources on 2026-04-03:

- Spec: `https://www.notion.so/337fc1b44024812291bac97a93ca6e10`
- Linked plan: `https://www.notion.so/337fc1b4402481ea8986cf11e4e7bce3`

## Verdict

Page 03 is implemented for the production execution spine described in the spec and linked implementation plan.

The codebase now has a scheduler-owned due-entry runner, a canonical `executePlanEntry` path that both creates and initiates downstream transfers, governed Collection Attempt lifecycle advancement driven from real initiation outcomes, and retry-loop preservation through rule evaluation. Browser e2e coverage was not required because the production delivery surface for this page is backend scheduler/orchestration behavior, not a user-facing route.

## Coverage Matrix

| Spec item | Status | Evidence |
| --- | --- | --- |
| Production code can execute eligible plan entries into Collection Attempts | Implemented | `convex/payments/collectionPlan/runner.ts`, `convex/payments/collectionPlan/execution.ts`, `convex/crons.ts` |
| Execution no longer depends on seed-only or test-only insertion paths | Implemented | Due entries are discovered via `getDuePlannedEntries` and executed through `processDuePlanEntries` -> `executePlanEntry` |
| Layer boundary between Collection Plan and Collection Attempts remains explicit | Implemented | `executePlanEntry` remains the AMPS-owned command; downstream transfer ownership stays in Unified Payment Rails |
| Every production execution flows through the canonical page-02 command | Implemented | `processDuePlanEntries` calls `internal.payments.collectionPlan.execution.executePlanEntry` only |
| Successful execution creates one Collection Attempt and at most one downstream transfer request | Implemented | Replay-safe handoff keys plus runner/execution tests prove one-attempt / one-transfer behavior |
| The production path initiates downstream transfer execution | Implemented | `executePlanEntry` now calls `initiateTransferInternal` after transfer-request creation |
| Collection Attempt state advances through GT based on real initiation outcomes | Implemented | `advanceAttemptForTransferState`, `progressAttemptFailure`, `collectionAttempt.machine.ts`, `engine/transition.ts` |
| Failure paths stay durable and feed retry-rule behavior | Implemented | `scheduleRetryEntry`, retry follow-up transitions, runner/execution failure-path tests |
| AMPS does not call `TransferProvider` directly | Implemented | All provider initiation remains inside `convex/payments/transfers/mutations.ts` |
| Unified Payment Rails remains owner of transfer lifecycle and settlement effects | Implemented | Page-03 work stops at initiation-path orchestration; transfer settlement/cash posting remains downstream |
| Mortgage lifecycle remains obligation-driven | Implemented | No page-03 code patches mortgage state directly |
| Scheduler path is replay-safe for cron reruns | Implemented | `getDuePlannedEntries` selects only `planned`; `executePlanEntry` replay safety remains enforced |
| Execution observability explains selection and outcomes | Implemented | Runner summary logging plus execution/handoff audit logs |
| Backend integration coverage exercises the live spine | Implemented | `convex/payments/collectionPlan/__tests__/execution.test.ts`, `convex/payments/collectionPlan/__tests__/runner.test.ts`, `src/test/convex/engine/transition.test.ts` |

## Use Case Coverage

| Use case | Status | Evidence |
| --- | --- | --- |
| UC-1: Scheduler discovers due entries and executes them | Implemented | `runner.test.ts` manual-path coverage |
| UC-2: Replay and cron reruns do not duplicate attempts/transfers | Implemented | `execution.test.ts` replay case, `runner.test.ts` rerun case |
| UC-3: Failure execution remains durable and continues into retry planning | Implemented | `execution.test.ts` failure case, `runner.test.ts` retry-loop case |

## Key Design Outcomes Verified

- The due-entry runner is wired in `convex/crons.ts`.
- The scheduler path does not insert Collection Attempts directly.
- Transfer initiation happens immediately after transfer-request creation through Unified Payment Rails.
- Collection Attempt transitions are driven through governed transitions, not direct status patches.
- Built-in XState actions are no longer mis-scheduled as effects, which prevents duplicate guarded-branch effects and noisy `incrementRetryCount` warnings.
- The legacy bridge-transfer path is treated as compatibility-only and skipped when a real `transferRequestId` is already linked to the attempt.

## Intentional Scope Boundaries Preserved

- Page 03 owns initiation-path orchestration only.
- Broader settlement-path reconciliation remains a page-04 concern.
- Browser e2e coverage was intentionally not added because this page delivers backend orchestration, not UI behavior.

## Residual Notes

1. Older low-level payment-chain suites under `src/test/convex/payments/` still include manual GT-driving scenarios. That is now compatibility coverage, not the primary verification surface for page 03.
2. Focused manual-path spine tests still emit downstream fixture warnings from unrelated seeded-environment gaps such as missing borrower receivable accounts and no active mortgage positions for dispersal creation. These warnings do not indicate page-03 spine failures.

## Verification Evidence

- `bun run test convex/payments/collectionPlan/__tests__/execution.test.ts convex/payments/collectionPlan/__tests__/runner.test.ts convex/engine/machines/__tests__/collectionAttempt.test.ts src/test/convex/engine/transition.test.ts`
- `bun check`
- `bunx convex codegen`
- `bun typecheck`
- GitNexus `detect_changes(scope=\"all\")` reported `risk_level: medium` for the final diff on repo `fairlendapp`

## Final Assessment

No blocking gaps remain for the page-03 objective. The production execution spine from due Collection Plan entry to live Collection Attempt initiation is now present, verified, and aligned with the current Notion spec and linked implementation plan as of 2026-04-03.
