# 15. Support Provider-Managed Recurring Collection Schedules — Design

> Derived from the current repo architecture and the 2026-04-11 product discussion.

## Types & Interfaces

### Canonical ownership boundary
- AMPS continues to own:
  - `obligations`
  - `collectionPlanEntries`
  - `collectionAttempts`
  - business rules for collection strategy and debt application
- Unified Payment Rails continues to own:
  - `transferRequests`
  - `TransferProvider`
  - transfer lifecycle
  - provider-backed settlement and reversals
- New recurring schedule management capability should also live on the payment-rails side rather than inside AMPS business logic.

### Existing transfer contract remains occurrence-scoped
`TransferProvider` is already the correct boundary for one realized rail movement. It should remain occurrence-scoped and should not be overloaded to represent one 12-month recurring schedule.

### New schedule-level provider contract
Add a new provider capability for externally managed recurring schedules:

```ts
export interface RecurringCollectionScheduleProvider {
  createSchedule(input: RecurringCollectionScheduleInput): Promise<{
    externalScheduleRef: string;
    status: "pending" | "active";
    providerData?: Record<string, unknown>;
  }>;
  cancelSchedule(externalScheduleRef: string): Promise<{
    cancelled: boolean;
    providerData?: Record<string, unknown>;
  }>;
  getScheduleStatus(externalScheduleRef: string): Promise<{
    status: string;
    providerData?: Record<string, unknown>;
  }>;
  pollOccurrenceUpdates(args: {
    externalScheduleRef: string;
    startDate: string;
    endDate?: string;
    maxEvents?: number;
    sinceCursor?: string;
  }): Promise<{
    events: NormalizedExternalCollectionOccurrenceEvent[];
    nextCursor?: string;
    providerData?: Record<string, unknown>;
  }>;
}
```

### Normalized occurrence event
Both webhooks and polling should normalize into the same shape before any local matching or materialization:

```ts
export interface NormalizedExternalCollectionOccurrenceEvent {
  providerCode: "pad_rotessa";
  externalScheduleRef: string;
  externalOccurrenceOrdinal?: number;
  externalOccurrenceRef?: string;
  providerRef?: string; // transaction id when known
  scheduledDate?: string;
  occurredAt?: number;
  amount?: number;
  rawProviderStatus: string;
  rawProviderReason?: string;
  receivedVia: "webhook" | "poller";
  mappedTransferEvent:
    | "PROCESSING_UPDATE"
    | "FUNDS_SETTLED"
    | "TRANSFER_FAILED"
    | "TRANSFER_REVERSED";
  providerData?: Record<string, unknown>;
}
```

### Provider lifecycle mirroring
The local system must preserve the exact provider lifecycle independently from canonical FairLend state machines.

Use raw-provider mirror fields for diagnostics and tests:
- `collectionPlanEntries.externalProviderEventStatus`
- `collectionPlanEntries.externalProviderReason`
- `collectionPlanEntries.externalLastReportedAt`
- `collectionPlanEntries.externalLastIngestedVia`
- `collectionAttempts.providerLifecycleStatus`
- `collectionAttempts.providerLifecycleReason`
- `collectionAttempts.providerLastReportedAt`
- `collectionAttempts.providerLastReportedVia`

The FairLend transfer and attempt machines still remain canonical for business behavior. Raw provider fields exist so operators and tests can inspect exact provider state such as `Future`, `Pending`, `Approved`, and `Declined` without overloading local machine semantics.

### Rotessa status mapping contract
For the first provider-managed delivery, Rotessa lifecycle values map as follows:

| Rotessa status | Local raw mirror | Mapped transfer event | Notes |
|---|---|---|---|
| `Future` | persist exact value | `PROCESSING_UPDATE` | The occurrence exists remotely and may lazily materialize local attempt/transfer rows. |
| `Pending` | persist exact value | `PROCESSING_UPDATE` | Keeps the local occurrence on the non-terminal path. |
| `Approved` | persist exact value | `FUNDS_SETTLED` | Reuses existing settlement and ledger effects. |
| `Declined` | persist exact value plus reason such as `NSF` | `TRANSFER_FAILED` | Reuses existing failure and retry policy while preserving provider decline reason. |

### Mortgage default vs plan-entry snapshot
Introduce two related but separate concepts:

- `mortgages.collectionExecutionMode`
  - default execution ownership for future collection
  - values:
    - `"app_owned"`
    - `"provider_managed"`
- `collectionPlanEntries.executionMode`
  - per-entry snapshot used by runtime execution
  - values:
    - `"app_owned"`
    - `"provider_managed"`

This split is required so a mortgage can change future ownership without rewriting the meaning of historical or already-linked entries.

## Database Schema

### `mortgages`
Add fields:
- `collectionExecutionMode`
- `collectionExecutionProviderCode?`
- `activeExternalCollectionScheduleId?`
- `collectionExecutionUpdatedAt?`

These fields express the mortgage default. They do not replace per-entry linkage.

### New table: `externalCollectionSchedules`
Add a new directly managed aggregate for one provider-owned recurring schedule.

This table is not a Transition Engine entity. The schedule row tracks provider
activation, sync leases, polling cursors, and operator diagnostics through
explicit `ctx.db.patch(...)` mutations because it represents provider execution
ownership, not a governed business lifecycle like `obligations` or
`transferRequests`.

- aggregate fields
  - `status`
  - `machineContext?` (optional escape hatch for future schedule orchestration, not a governed state machine snapshot)
  - `lastTransitionAt`
- provider / ownership fields
  - `mortgageId`
  - `borrowerId`
  - `providerCode`
  - `bankAccountId`
  - `externalScheduleRef?`
  - `activationIdempotencyKey`
  - `startDate`
  - `endDate`
  - `cadence`
  - `coveredFromPlanEntryId`
  - `coveredToPlanEntryId`
  - `activatedAt?`
  - `cancelledAt?`
  - `lastSyncedAt?`
  - `lastSyncCursor?`
  - `lastSyncAttemptAt?`
  - `nextPollAt?`
  - `syncLeaseOwner?`
  - `syncLeaseExpiresAt?`
  - `lastSyncErrorAt?`
  - `lastSyncErrorMessage?`
  - `consecutiveSyncFailures`
  - `lastProviderScheduleStatus?`
  - `providerData?`
  - `source`
  - `createdAt`

Recommended indexes:
- `by_mortgage`
- `by_provider_ref`
- `by_status`
- `by_status_and_next_poll`

Recommended schedule states:
- `draft`
- `activating`
- `activation_failed`
- `active`
- `sync_error`
- `cancelling`
- `cancelled`
- `completed`

### `collectionPlanEntries`
Extend existing rows rather than introducing a second occurrence table. The plan entry is already the local monthly occurrence placeholder.

Add fields:
- `executionMode`
- `externalCollectionScheduleId?`
- `externalOccurrenceOrdinal?`
- `externalOccurrenceRef?`
- `externalProviderEventStatus?`
- `externalProviderReason?`
- `externallyManagedAt?`
- `externalLastReportedAt?`
- `externalLastIngestedVia?`

Extend `status` with:
- `provider_scheduled`

Planned status usage:
- `planned`
  - eligible for the internal app-owned runner
- `provider_scheduled`
  - linked to an external recurring schedule and explicitly ineligible for the internal runner
- `executing`
  - a local attempt and transfer now exist for this occurrence

### `collectionAttempts`
No new table is required, but extend `triggerSource` with:
- `provider_webhook`
- `provider_poller`

These values document how the local occurrence was materialized.

Add fields:
- `providerLifecycleStatus?`
- `providerLifecycleReason?`
- `providerLastReportedAt?`
- `providerLastReportedVia?`
- `providerOccurrenceKey?`

### `transferRequests`
The existing table is sufficient for occurrence-level execution. No new table is required.

The minimum requirement is:
- retain `providerCode`
- retain `providerRef`
- keep `planEntryId`
- keep `collectionAttemptId`

Schedule-level linkage can be reached through `planEntryId -> externalCollectionScheduleId`, so a new direct `externalCollectionScheduleId` field on `transferRequests` is optional and should only be added if debugging/query ergonomics justify it.

## Architecture

### Runtime ownership decision matrix
Execution ownership is a first-class runtime branch and must not be inferred from `method` alone.

Use the following decision rules:

| `collectionPlanEntries.executionMode` | `collectionPlanEntries.status` | Owning path | Allowed behavior |
|---|---|---|---|
| `app_owned` | `planned` | existing collection-plan runner | `executePlanEntry` may run |
| `provider_managed` | `provider_scheduled` | webhook or provider-managed poller | local occurrence may be materialized from provider report |
| `provider_managed` | `executing` | webhook or provider-managed poller | existing local occurrence may receive additional provider updates |
| either | terminal states | none | read-only except explicit recovery or operator diagnostics |

This is a deliberate design choice because `pad_rotessa` can exist in both execution modes:
- app-owned monthly initiation through the existing runner
- provider-managed recurring schedule ownership through webhook and poller ingestion

### Production cron topology
The production runtime should use separate crons with separate responsibilities.

Keep the existing cron:
- `collection plan execution spine`
- cadence: every 15 minutes
- responsibility: select due `planned` entries with `executionMode = app_owned` and call `executePlanEntry`

Add a new cron:
- `provider-managed schedule polling spine`
- cadence: every 15 minutes
- responsibility: poll active provider-managed schedules, normalize occurrence updates, and feed the shared occurrence-ingestion path

Do not overload the existing app-owned runner to sometimes execute and sometimes poll. The existing runner is built around a due-entry execution contract; the provider-managed path is schedule-centric and must never directly initiate monthly draws for a schedule already owned by Rotessa.

### Poller cadence and selection constants
Use these default production constants unless implementation data later justifies tuning:
- `POLL_INTERVAL_MINUTES = 15`
- `SCHEDULE_BATCH_SIZE = 25`
- `SYNC_LEASE_MS = 10 * 60 * 1000`
- `OCCURRENCE_LOOKBACK_DAYS = 14`
- `OCCURRENCE_LOOKAHEAD_DAYS = 3`
- `MAX_PROVIDER_EVENTS_PER_SCHEDULE = 100`
- `SYNC_ERROR_THRESHOLD = 3`

These defaults are chosen to:
- align with the existing 15-minute scheduler cadence
- keep provider calls bounded
- recover missed webhooks for recently due occurrences
- avoid missing imminent `Future` occurrences

### Internal app-owned flow remains unchanged
`planned` app-owned entries continue to flow through the existing runner:

`collectionPlanEntries(status=planned, executionMode=app_owned)`
-> due-entry query
-> `executePlanEntry`
-> `collectionAttempt`
-> `transferRequest`
-> provider initiation
-> transfer state machine
-> attempt effects
-> obligation settlement
-> ledger

### External activation flow
Add an activation action that covers a group of future plan entries with one external provider schedule:

`admin activate external schedule`
-> validate mortgage mode, bank account, mandate, and target entry set
-> create local `externalCollectionSchedules` row in `activating`
-> call `RecurringCollectionScheduleProvider.createSchedule`
-> persist `externalScheduleRef`
-> patch covered future plan entries:
   - `executionMode = provider_managed`
   - `status = provider_scheduled`
   - `externalCollectionScheduleId = scheduleId`
   - `externalOccurrenceOrdinal = deterministic local occurrence ordinal`
-> mark schedule `active`

### Two-phase activation requirement
Activation cannot be a single database transaction because provider schedule creation is an external call.

Use a two-phase flow:

1. local row created as `activating`
2. external provider create call
3. finalize mutation patches plan entries and marks schedule `active`

If step 2 succeeds and step 3 fails, recovery must be possible from the persisted local `activating` row plus provider schedule reference.

### External occurrence ingestion flow
Use one normalized ingestion path for both webhooks and polling:

`webhook/poller`
-> normalize provider payload to `NormalizedExternalCollectionOccurrenceEvent`
-> resolve local plan entry
-> ensure local occurrence materialization
-> fire mapped transfer transition

The local materialization helper should:

1. resolve exactly one `collectionPlanEntry`
2. create or load `collectionAttempt`
3. create or load `transferRequest`
4. patch the plan entry to `executing` if this is the first local materialization
5. fire the mapped transfer transition

On every ingestion, before firing the mapped transfer transition:
6. persist raw provider lifecycle fields on the plan entry
7. persist raw provider lifecycle fields on the attempt when one exists
8. persist receive channel as `webhook` or `poller`

### Matching order for provider-managed occurrences
Current webhook handling is transfer-centric. That remains valid for already-materialized occurrences, but new external recurring schedules need a pre-transfer lookup path.

Recommended match order:

1. existing `transferRequest` by `providerCode + providerRef`
2. `collectionPlanEntry` by `externalCollectionScheduleId + externalOccurrenceRef`
3. `collectionPlanEntry` by `externalOccurrenceRef`
4. `collectionPlanEntry` by `externalCollectionScheduleId + externalOccurrenceOrdinal`
5. `collectionPlanEntry` by `externalCollectionScheduleId + scheduledDate` when unique
6. otherwise fail closed:
   - persist audit trail
   - mark the occurrence unresolved
   - require operator review

This preserves current transfer-centric behavior while extending the system to work before a transfer exists.

### Lazy local materialization
Create local occurrence records only when the provider has something real to report.

For one normalized occurrence event:

- if no attempt exists:
  - create `collectionAttempt`
  - set `triggerSource = provider_webhook | provider_poller`
  - set `executionRequestedAt` to provider occurrence time or receive time
  - set `executionIdempotencyKey` to a provider-occurrence composite key
- if no transfer exists:
  - create `transferRequest`
  - `providerCode = pad_rotessa`
  - `providerRef = provider transaction id` when available
  - `idempotencyKey = provider-managed-occurrence:<providerCode>:<externalScheduleRef>:<occurrenceKey>`
- if the event already created both records:
  - load and reuse them idempotently

Once the local transfer exists, the existing transfer state machine remains canonical.

### Transfer lifecycle reuse
Do not bypass the existing transfer machine.

After materialization, the externally managed flow should still call:
- `PROCESSING_UPDATE`
- `FUNDS_SETTLED`
- `TRANSFER_FAILED`
- `TRANSFER_REVERSED`

on the existing transfer state machine.

This preserves:
- `publishTransferConfirmed`
- transfer reconciliation
- collection attempt settlement reconciliation
- downstream obligation and ledger effects

### Internal runner isolation
The existing due-entry runner must only process entries that are truly app-owned.

Implementation rule:
- keep the current `status = planned` selection
- additionally treat `executionMode = app_owned` as a defensive filter in new helper code

This avoids future bugs where a status regression accidentally exposes provider-managed entries to the internal runner.

### Polling as backstop, not replacement
Webhook handling should remain the primary occurrence ingestion path when the provider supports it.

Add a provider-managed schedule poller as:
- a backstop for missed webhooks
- a status synchronizer for schedule health and occurrence recovery

Polling should use:
- `externalCollectionSchedules.status = active`
- due or recently due `provider_scheduled` entries
- provider cursor or last sync timestamp where supported

### Poller schedule-selection contract
The provider-managed poller should select schedules using all of the following rules:
- `status in ("active", "sync_error")`
- `nextPollAt <= now`
- no active lease or expired lease only
- at least one linked plan entry where:
  - `executionMode = provider_managed`
  - `status in ("provider_scheduled", "executing")`
  - `scheduledDate` falls within `[now - OCCURRENCE_LOOKBACK_DAYS, now + OCCURRENCE_LOOKAHEAD_DAYS]`

### Poller algorithm
For each cron run:

1. claim up to `SCHEDULE_BATCH_SIZE` schedules with an expiring lease
2. for each claimed schedule:
   - set `lastSyncAttemptAt = now`
   - call `pollOccurrenceUpdates({ externalScheduleRef, startDate, endDate, maxEvents, sinceCursor })`
   - normalize and sort occurrence events deterministically by scheduled date, occurred-at timestamp, then provider reference
   - feed each event through the shared occurrence-ingestion action
   - update `lastSyncedAt`, `lastSyncCursor`, `nextPollAt`, `lastProviderScheduleStatus`
   - reset `consecutiveSyncFailures`
   - clear the lease
3. on failure:
   - increment `consecutiveSyncFailures`
   - set `lastSyncErrorAt` and `lastSyncErrorMessage`
   - set `status = sync_error` once failures cross `SYNC_ERROR_THRESHOLD`
   - set `nextPollAt` using bounded backoff
   - clear the lease

### Cursor and fallback window contract
The poller must prefer provider cursors when the provider supports them. When a cursor is unavailable or unreliable:
- derive a query window from `max(lastSyncedAt, now - OCCURRENCE_LOOKBACK_DAYS)`
- include a small future lookahead so `Future` occurrences can be mirrored locally before processing begins
- never rely on webhook delivery alone for occurrence discovery

### Lease and idempotency contract
Polling must be safe across overlapping cron runs and retries.

Implementation rules:
- only one worker may hold a live lease on one external schedule at a time
- lease acquisition must be mutation-backed, not in-memory
- occurrence materialization remains idempotent even if a lease expires mid-run and the schedule is polled again
- webhook and poller replays must converge on one local attempt and one local transfer per provider occurrence

## API Surface

### New schedule-level surfaces
- activation action
  - create one provider-managed recurring schedule for a group of future entries
- cancellation action
  - stop future externally managed occurrences
- poller action
  - claim eligible schedules and poll provider occurrence updates
- schedule query surface
  - list schedules by mortgage
  - show linked entries
  - show sync health

### New normalized occurrence surfaces
- internal mutation or action to:
  - normalize provider occurrence input
  - resolve local occurrence linkage
  - materialize local attempt and transfer idempotently
  - fire mapped transfer transition

### Recommended module layout
To keep ownership boundaries explicit, implement the feature in a dedicated provider-managed collection area on the payment-rails side. A recommended layout is:

- `convex/payments/recurringSchedules/types.ts`
- `convex/payments/recurringSchedules/validators.ts`
- `convex/payments/recurringSchedules/activation.ts`
- `convex/payments/recurringSchedules/poller.ts`
- `convex/payments/recurringSchedules/queries.ts`
- `convex/payments/recurringSchedules/occurrenceIngestion.ts`
- `convex/payments/recurringSchedules/providers/rotessaRecurring.ts`
- extend `convex/payments/webhooks/rotessaPad.ts`
- extend `convex/crons.ts`

The exact filenames can vary, but the implementation must preserve this separation:
- app-owned execution remains under the existing collection-plan execution path
- provider-managed recurring schedule ownership lives with payment rails
- webhook and poller ingress share the same occurrence-ingestion helper

### Existing transfer webhook handlers
Existing provider webhook adapters should be extended to:
- first try current transfer-centric lookup
- fall back to schedule-centric occurrence resolution for provider-managed recurring schedules

## Idempotency

### Activation
- `activationIdempotencyKey` should be deterministic from:
  - mortgage
  - provider
  - covered plan-entry set
  - schedule start boundary

### Occurrence materialization
- use one deterministic occurrence key:
  - `providerCode + externalScheduleRef + externalOccurrenceOrdinal`
  - or `providerCode + externalScheduleRef + scheduledDate`
  - or provider transaction id when the provider guarantees one transaction per occurrence

### Transfer creation
- transfer request idempotency must be scoped to one occurrence, not one schedule

### Replays
- webhook replays and repeated poll results must never duplicate:
  - `collectionAttempts`
  - `transferRequests`
  - transfer settlement effects
  - obligation payment application

### Webhook-poller convergence
If a webhook and a poller report the same occurrence in either order:
- both inputs must resolve to the same occurrence key
- both inputs must reuse the same local attempt and transfer rows
- later reports may update raw provider mirror fields
- later reports must not replay terminal settlement effects once they have already been applied

## Parallel Operation Rules

### Across mortgages
Different mortgages may use different execution modes at the same time.

### Within one mortgage
The supported model is:
- historical app-owned execution remains as-is
- explicitly selected future entries can be activated onto one provider-managed schedule

This allows a safe cutover for future payments without mutating past attempts, transfers, or settled obligations.

### One occurrence, one owner
At runtime, a single `collectionPlanEntry` must be owned by exactly one execution system:
- app-owned
- provider-managed

The system must treat dual ownership as a hard integrity defect.

## Verification Strategy

Minimum coverage should include:
- app-owned mortgages remain unchanged
- provider schedule activation patches future entries to `provider_scheduled`
- internal runner skips provider-managed entries
- webhook occurrence creates missing local attempt and transfer
- repeated webhook is idempotent
- poll result can recover a missed webhook
- failure and reversal reuse current transfer -> attempt -> obligation behavior
- mixed portfolio of app-owned and provider-managed mortgages operates without cross-talk
- raw Rotessa statuses `Future`, `Pending`, `Approved`, and `Declined` are mirrored locally
- polling cron never calls `executePlanEntry`
- overlapping polling runs do not duplicate schedule polling or occurrence materialization

## Observability & Operations

### Schedule health surface
Operators should be able to inspect at least:
- schedule status
- provider code
- external schedule reference
- `lastSyncedAt`
- `lastSyncAttemptAt`
- `nextPollAt`
- `consecutiveSyncFailures`
- `lastSyncErrorAt`
- `lastSyncErrorMessage`
- linked plan-entry range

### Occurrence health surface
Operators should be able to inspect per occurrence:
- plan-entry status
- execution mode
- raw provider lifecycle status and reason
- last ingestion channel
- linked attempt and transfer ids
- whether the occurrence has reached terminal local settlement

### Alerting expectations
At minimum, the implementation should emit actionable logs or audit events when:
- activation finalization fails
- occurrence matching is ambiguous or unresolved
- a schedule crosses `SYNC_ERROR_THRESHOLD`
- a poller run cannot acquire expected provider data for an active schedule

## Implementation Decisions

### Do not create a separate local occurrence table
`collectionPlanEntry` is already the local monthly occurrence placeholder. Reusing it avoids duplication and keeps schedule ownership separate from debt and strategy.

### Do not overload `collectionAttempt` to represent a 12-month schedule
`collectionAttempt` is a single-occurrence execution record. A provider-managed recurring schedule is a parent aggregate and must be modeled separately.

### Do not overload `TransferProvider` for schedule creation
`TransferProvider` stays per transfer occurrence. Recurring schedule creation needs a schedule-level provider capability.

### Keep the downstream settlement path unchanged
Once a provider-managed occurrence has a local transfer, the existing transfer machine and effects stay authoritative. The new work is in schedule ownership, occurrence resolution, and lazy local materialization, not in re-implementing settlement.
