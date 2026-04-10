# 02. Define Canonical Plan Entry Execution API — Design

> Derived from: https://www.notion.so/337fc1b440248115b4d3c21577f27601

## Types & Interfaces

### Execution input
- `planEntryId`
- `triggerSource`
  - `system_scheduler`
  - `admin_manual`
  - `workflow_replay`
  - `migration_backfill`
- `requestedAt`
- `idempotencyKey`
- optional actor attribution
- optional reason
- optional `dryRun`

### Execution outcome union
- `attempt_created`
- `already_executed`
- `not_eligible`
- `rejected`
- `noop`

Each result branch carries:
- `planEntryId`
- `planEntryStatusAfter`
- `collectionAttemptId` when an attempt exists
- `transferRequestId` when Payment Rails handoff succeeds immediately
- `attemptStatusAfter` when an attempt exists
- `reasonCode` for non-created or degraded outcomes
- `reasonDetail`
- `idempotencyKey`
- `executionRecordedAt`

### Reason-code families
- rejection
  - missing or invalid request shape
  - plan entry not found
- non-eligibility
  - plan entry not executable
  - scheduled date still in the future
  - plan entry already cancelled, rescheduled, or otherwise superseded
  - related obligations are not collectible
  - required execution metadata is missing
- noop
  - reserved for explicitly supported valid-no-op cases such as unsupported dry-run mode
- degraded creation
  - attempt exists but transfer handoff failed, while the attempt remains durable

## Database Schema

### `collectionPlanEntries`
Add the minimum metadata needed to make the execution contract explicit:
- `executedAt?: number`
- `executionIdempotencyKey?: string`
- `collectionAttemptId?: Id<"collectionAttempts">`

Use existing `status` to move a consumed plan entry from `planned` to `executing`.

### `collectionAttempts`
Add the minimum metadata needed to persist execution context and downstream linkage:
- `executionRequestedAt?: number`
- `executionIdempotencyKey?: string`
- `triggerSource?: string`
- `requestedByActorType?: string`
- `requestedByActorId?: string`
- `executionReason?: string`
- `transferRequestId?: Id<"transferRequests">`

Existing fields remain the primary business execution surface:
- `planEntryId`
- `status`
- `providerRef`
- `providerStatus`
- `providerData`
- `failureReason`

## Architecture

### Data Flow
`executePlanEntry` internal action
-> load + validate plan entry
-> call `stagePlanEntryExecution` internal mutation inside the transaction boundary
-> create Collection Attempt and consume / link the plan entry
-> commit the transaction
-> create transfer-request handoff through the Unified Payment Rails contract
-> return structured result

### API Surface

#### Writes
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `executePlanEntry` | canonical execution input | structured outcome union | Internal AMPS action entrypoint for one plan-entry execution request |

#### Shared modules
| Module | Responsibility |
|--------|----------------|
| `executionContract.ts` | input validators, shared result types, reason codes, helper builders |
| `executionGuards.ts` | eligibility and replay classification |
| `execution.ts` | internal action orchestration |
| `stagePlanEntryExecution` | internal mutation that stages plan-entry execution and persists attempt linkage |

## Implementation Decisions

### Internal-first command
This issue ships an internal AMPS action first. Scheduler wiring and operator wrappers remain downstream work, but both will converge on the same internal callable. The transfer-request handoff stays outside the transaction boundary so staging and downstream provider work remain separable.

### Attempt-first persistence
The Collection Attempt is created before Payment Rails handoff. If handoff fails, the attempt remains durable and the result surfaces the degraded handoff outcome.

### Minimum schema only
Only the fields needed to encode replay safety and linkage are added here. Broader schema alignment remains page 11 work.

### No direct `TransferProvider` usage
AMPS hands off by creating a `transferRequest` through the existing Unified Payment Rails boundary. Provider selection and lifecycle remain downstream concerns.

### No execution-side obligation or cash mutation
This workstream does not settle obligations, post cash, or alter mortgage lifecycle state. Those remain downstream confirmation effects.
