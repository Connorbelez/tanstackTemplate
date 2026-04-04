# 03. Implement Collection Plan -> Collection Attempt Execution Spine — Design

> Derived from: https://www.notion.so/337fc1b44024812291bac97a93ca6e10

## Types & Interfaces

### Existing canonical execution contract
The page-02 contract in `convex/payments/collectionPlan/executionContract.ts`
remains authoritative for:
- `ExecutePlanEntryArgs`
- `ExecutePlanEntryResult`
- replay-safe outcome taxonomy
- execution-source and transfer-handoff helpers

Page 03 builds on that contract rather than redefining it.

### New runner-facing contract
The production runner needs:
- a due-entry selection shape
  - `planEntryId`
  - `scheduledDate`
  - `method`
  - `amount`
- a batch execution result shape
  - selected count
  - attempted count
  - skipped / ineligible count
  - created count
  - already-executed count
  - failed-initiation count

### Attempt state advancement mapping
Planned mapping for real initiation outcomes:
- transfer initiated with provider reference
  - fire `DRAW_INITIATED` on `collectionAttempt`
- transfer immediately confirmed
  - fire `FUNDS_SETTLED` on `collectionAttempt`
- transfer initiation failure
  - fire `DRAW_FAILED` on `collectionAttempt`

Any mapping must use GT transitions via `executeTransition`, not direct attempt
status patching.

## Database Schema

### Existing schema sufficient for phase-03 baseline
Page 02 already added the minimum execution metadata needed for the spine:
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

### Likely query/index work
The current `collectionPlanEntries` indexes support:
- `by_status`
- `by_scheduled_date`

The due-entry runner should prefer `by_scheduled_date` plus status filtering or a
purpose-built helper that minimizes full-table scans of planned entries.

## Architecture

### Data Flow
`convex/crons.ts`
-> collection-plan due runner action
-> due-entry query / bounded batch selection
-> `executePlanEntry`
-> transfer request creation
-> `initiateTransferInternal`
-> transfer-initiation outcome classification
-> `executeTransition` on `collectionAttempt`
-> existing collection-attempt GT effects for payment receipt / retry loop

### Component Structure
No new frontend component structure is required for the initial page-03 spine.

### API Surface

#### Reads (Queries/GET)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `getPlanEntriesByStatus` or successor due-entry helper | `status`, optional `scheduledBefore`, optional limit | due plan-entry rows | Load due planned entries for runner-owned execution |

#### Writes (Mutations/POST)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| `executePlanEntry` | canonical page-02 execution args | structured execution result | Only production attempt-creation path |
| collection-attempt transition helper(s) | attempt id + event payload | GT transition result | Advance attempts from real initiation outcomes |

#### Side Effects (Actions/Jobs)
| Function | Args | Returns | Description |
|----------|------|---------|-------------|
| new due-entry runner action | batch size, optional cursor/run metadata | runner summary | Select and execute due entries |
| `initiateTransferInternal` | `transferId` | transfer transition result | Canonical Payment Rails initiation step |
| cron registration in `convex/crons.ts` | schedule config | n/a | Run the due-entry spine continuously in production |

### Routing
No route changes are required for the initial implementation. Scheduler and
backend integration tests are the primary delivery surface.

## Implementation Decisions

### Canonical executor remains the only attempt-creation path
`executePlanEntry` already exists and should stay the sole production path for
turning plan entries into Collection Attempts. The runner calls it; it does not
reimplement it.

### Prefer immediate follow-up initiation in the same spine
The current repo truth already creates a transfer request inside
`executePlanEntry`. Page 03 should extend that live spine to call
`initiateTransferInternal` immediately after request creation unless the code
review shows a hard reason to split it.

### Governed transitions, not status patches
`collectionAttempts.status` should only change through GT transitions once the
attempt exists. Page 03 should remove or isolate any remaining ad hoc attempt
status patching from the normal initiation path.

### Preserve the older confirmed-attempt bridge as legacy compatibility
`emitPaymentReceived` currently creates a bridged transfer on attempt
confirmation. Page 03 should not break that path abruptly, but it should make
the new plan-entry execution spine the canonical happy path and document any
remaining legacy overlap for page 04 cleanup.

### Backend integration coverage is higher-value than browser e2e
This workstream is scheduler-heavy and backend-dominant. The most important
tests should live in Convex integration suites that exercise due-entry
selection, execution, transfer initiation, and GT advancement directly. Browser
e2e is not the primary proof surface unless a real operator UI is added.
