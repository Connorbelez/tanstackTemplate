# 02. Define Canonical Plan Entry Execution API — Gap Analysis

## Summary
Status: implemented

This workstream landed the canonical internal AMPS execution contract for taking one executable `collectionPlanEntries` row and turning it into exactly one governed `collectionAttempts` record, with explicit replay-safe outcomes and an explicit Payment Rails handoff boundary.

## What shipped
- Shared execution contract types, validators, outcome taxonomy, and reason codes in `convex/payments/collectionPlan/executionContract.ts`.
- Eligibility and replay guard helpers in `convex/payments/collectionPlan/executionGuards.ts`.
- Canonical internal execution entrypoint in `convex/payments/collectionPlan/execution.ts`.
- Minimum schema support for plan-entry execution linkage and attempt execution metadata in `convex/schema.ts`.
- Contract-focused backend tests in `convex/payments/collectionPlan/__tests__/execution.test.ts`.

## Requirement coverage
### REQ-1: one canonical AMPS execution command exists
Covered.

`internal.payments.collectionPlan.execution.executePlanEntry` is the canonical internal-first command. Scheduled, replay, migration, and future admin wrappers can converge on this path.

### REQ-2: structured result union keyed by outcome
Covered.

The execution contract returns explicit outcomes:
- `attempt_created`
- `already_executed`
- `not_eligible`
- `rejected`
- `noop`

Each result carries replay and audit metadata including `planEntryId`, `idempotencyKey`, `executionRecordedAt`, and status fields. `collectionAttemptId` and `transferRequestId` are included when present.

### REQ-3: business-layer replay safety before downstream transfer creation
Covered.

Replay handling occurs before transfer handoff. Existing attempt linkage is detected from `collectionPlanEntries.collectionAttemptId` or via the `by_plan_entry` attempt index. Replays return `already_executed` and do not create a second attempt.

### REQ-4: create Collection Attempt before Payment Rails handoff
Covered.

The stage mutation creates the attempt first, patches the plan entry as consumed/executing, and only then hands off to Payment Rails through transfer-request creation.

### REQ-5: explicit AMPS -> Payment Rails boundary
Covered.

AMPS calls the existing transfer-request creation contract and does not call `TransferProvider` directly. The handoff is recorded back on the attempt via `transferRequestId` and provider-status metadata.

### REQ-6: no direct settlement, cash posting, or delinquency mutation
Covered.

The implementation creates the business attempt and requests downstream transfer orchestration only. It does not settle obligations, post cash, or change mortgage delinquency state.

### REQ-7: minimum schema support
Covered.

Added minimum fields only:
- `collectionPlanEntries.executedAt`
- `collectionPlanEntries.executionIdempotencyKey`
- `collectionPlanEntries.collectionAttemptId`
- `collectionAttempts.triggerSource`
- `collectionAttempts.executionRequestedAt`
- `collectionAttempts.executionIdempotencyKey`
- `collectionAttempts.requestedByActorType`
- `collectionAttempts.requestedByActorId`
- `collectionAttempts.executionReason`
- `collectionAttempts.transferRequestId`

Broader retry/reschedule lineage remains deferred to page 11.

### REQ-8: verification scenarios
Covered at backend-contract level.

Passing tests verify:
- eligible execution creates exactly one attempt
- replay returns `already_executed`
- invalid request returns `rejected`
- ineligible request returns `not_eligible`
- transfer handoff failure preserves the created attempt

Browser e2e coverage is not required for this issue because the shipped surface is an internal backend contract with no new route or UI behavior.

## Accepted implementation choices
- The canonical entrypoint shipped as an internal action with a stage mutation for atomic attempt creation plus replay-safe linkage updates.
- Immediate transfer-request creation is included in this workstream because the Notion contract explicitly allows immediate Payment Rails handoff once the attempt exists.
- Handoff failure preserves the created attempt and marks it with `providerStatus: "transfer_handoff_failed"` rather than erasing the business record.

## Intentional deferrals
- No scheduler integration or broader execution spine orchestration. That remains page 03.
- No downstream transfer reconciliation, cash posting, or obligation settlement behavior. That remains page 04.
- No broader schema redesign for retries, supersession lineage, or richer admin metadata. That remains page 11.
- No public/admin wrapper mutation. This workstream is internal-first.

## Divergences from the spec or plan
No material divergence from the page-02 contract or linked implementation plan was found after re-fetching both pages on 2026-04-03.

The only notable implementation choice is that immediate transfer-request creation is already wired into `executePlanEntry` instead of being deferred to a follow-on orchestrator step. This is still within the allowed boundary described by the spec and implementation plan.

## Verification
- `bun run test convex/payments/collectionPlan/__tests__/execution.test.ts`
- `bun check`
- `bun typecheck`
- `bunx convex codegen`

All of the above passed for this workstream. `bun check` still reports unrelated pre-existing repository warnings outside this issue's scope.
