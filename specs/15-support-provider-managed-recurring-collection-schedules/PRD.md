# 15. Support Provider-Managed Recurring Collection Schedules

> Local working spec derived from the current repo architecture and the 2026-04-11 product discussion.

## Overview
FairLend needs to support two collection execution models in parallel:

1. App-owned collection execution
   - the current system behavior
   - local cron discovers due `collectionPlanEntries` and executes them into `collectionAttempts` and `transferRequests`
2. Provider-managed recurring collection execution
   - Rotessa is the first target provider
   - FairLend activates one recurring provider schedule for a group of future plan entries
   - provider occurrence updates later materialize per-occurrence `collectionAttempts` and `transferRequests` locally

Mortgage obligations and monthly `collectionPlanEntries` remain the canonical local debt and collection-intent records in both modes. This feature adds a second execution ownership model, not a second debt model.

## Features
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F-1 | Dual execution modes | A mortgage can operate under app-owned execution or provider-managed recurring execution. | P0 |
| F-2 | Recurring schedule activation | Operators can activate one external recurring schedule that covers a group of future plan entries. | P0 |
| F-3 | Local occurrence placeholders | Each monthly plan entry remains the local placeholder for one provider-managed occurrence. | P0 |
| F-4 | External occurrence materialization | Webhooks or polling can resolve a provider occurrence to a local plan entry and lazily create the matching attempt and transfer. | P0 |
| F-5 | Existing settlement reuse | Existing transfer transitions, collection-attempt effects, obligation settlement, and cash-ledger posting remain the canonical settlement path. | P0 |
| F-6 | Parallel operation | Internally managed mortgages and externally managed mortgages can operate at the same time without codepath overlap or double execution. | P0 |
| F-7 | Deterministic lookup before transfer exists | The system can match a provider occurrence even when no `transferRequest` exists yet. | P0 |
| F-8 | Schedule-level observability | Operators can see which provider schedule owns which local future entries and whether local occurrence materialization is healthy. | P1 |
| F-9 | Explicit cron topology | Production runtime clearly separates app-owned execution from provider-managed polling and recovery. | P0 |
| F-10 | Provider status mirroring | Raw provider lifecycle states such as `Future`, `Pending`, `Approved`, and `Declined` are preserved locally for diagnostics and testing without replacing canonical FairLend state machines. | P0 |

## Requirements
| ID | Requirement | Type | Acceptance Criteria |
|----|-------------|------|---------------------|
| REQ-1 | Obligations remain unchanged | Functional | Mortgage obligations are still generated exactly as they are today. This feature must not introduce a provider-owned debt schedule. |
| REQ-2 | Plan entries remain unchanged at generation time | Functional | Monthly `collectionPlanEntries` are still generated locally before execution ownership is decided. |
| REQ-3 | Mortgage-level execution ownership is explicit | Functional | A mortgage has a canonical collection execution mode that defaults new future execution behavior. |
| REQ-4 | Plan-entry execution ownership is snapshotted | Functional | Each `collectionPlanEntry` stores whether it is app-owned or provider-managed so later mortgage-level changes do not retroactively rewrite historical execution semantics. |
| REQ-5 | External activation is one schedule, many entries | Functional | An activation step can create one provider-managed recurring schedule that covers a selected set of future plan entries without creating one local transfer per future month up front. |
| REQ-6 | Provider-managed entries are excluded from the internal runner | Functional | The existing due-entry runner must never call `executePlanEntry` for entries delegated to an external recurring schedule. |
| REQ-7 | External schedule linkage is queryable before occurrence execution | Functional | A covered plan entry can be traced to its external schedule before any `collectionAttempt` or `transferRequest` exists. |
| REQ-8 | Webhook and poller inputs share one normalized ingestion path | Functional | Provider webhooks and provider pollers must normalize to the same occurrence event shape before local materialization logic runs. |
| REQ-9 | Occurrence matching is deterministic | Functional | A provider occurrence can be resolved to exactly one local plan entry by provider schedule linkage plus occurrence metadata, without requiring an existing transfer lookup. |
| REQ-10 | Lazy local materialization is idempotent | Functional | Replayed webhooks, repeated poll results, and recovery jobs must not create duplicate `collectionAttempts` or duplicate `transferRequests` for one provider occurrence. |
| REQ-11 | Existing transfer state machine remains canonical for settlement | Functional | Once a provider occurrence is materialized into a `transferRequest`, the existing transfer machine continues to own `FUNDS_SETTLED`, `TRANSFER_FAILED`, `TRANSFER_REVERSED`, and downstream effects. |
| REQ-12 | Existing attempt and obligation effects remain canonical | Functional | Once a provider occurrence is materialized into a `collectionAttempt`, the existing attempt effects remain responsible for obligation payment application and ledger integration. |
| REQ-13 | Parallel systems do not double-collect | Functional | The same plan entry cannot be eligible for both the internal app-owned runner and an external recurring provider schedule at the same time. |
| REQ-14 | PAD prerequisites still apply | Functional | Provider-managed PAD schedule activation must reuse bank-account and mandate validation rules already required for PAD-based transfers. |
| REQ-15 | Failure is visible and recoverable | Functional | Unresolved occurrence matching, activation finalization gaps, and schedule sync failures must be auditable and surfaced for operator review. |
| REQ-16 | Runtime branching is based on execution ownership | Functional | Production execution path must branch on `collectionPlanEntries.executionMode`, not on `method` alone, so a provider code such as `pad_rotessa` can support both app-owned and provider-managed operation. |
| REQ-17 | Separate cron responsibilities are explicit | Functional | The existing collection-plan runner continues to execute only app-owned due entries, and a separate provider-managed poller handles externally managed schedules. |
| REQ-18 | Poller is a fallback, not a duplicate executor | Functional | The provider-managed poller must never call `executePlanEntry`; it only normalizes provider occurrence updates and feeds the shared occurrence-ingestion path. |
| REQ-19 | Missed webhooks are recoverable by polling | Functional | If a provider webhook is missed, repeated polling of active external schedules must eventually materialize or update the correct local occurrence without duplicate attempts or transfers. |
| REQ-20 | Polling is concurrency-safe | Non-functional | Concurrent cron runs must not poll the same provider schedule in parallel without an explicit lease or equivalent claim mechanism. |
| REQ-21 | Polling supports cursors and bounded backfill | Functional | The poller must support provider cursors where available and otherwise use a deterministic lookback/lookahead window to recover recent and imminent occurrences. |
| REQ-22 | Provider lifecycle status is mirrored locally | Functional | The exact provider lifecycle state and reason code must be queryable on the local occurrence path even though FairLend state machines remain canonical for settlement and debt application. |
| REQ-23 | Production diagnostics are first-class | Non-functional | Operators can inspect schedule sync health, last successful poll, consecutive sync failures, last provider status, and linked plan entries without reading raw provider payloads. |

## Use Cases

### UC-1: Internal app-owned mortgage remains on the current execution path
- **Actor**: Scheduler-owned internal runner
- **Precondition**: Mortgage collection execution mode is app-owned
- **Flow**:
  1. Due `planned` entries are selected by the existing runner
  2. Runner calls `executePlanEntry`
  3. Local `collectionAttempt` and `transferRequest` are created immediately
  4. Existing transfer initiation and settlement logic runs unchanged
- **Postcondition**: Existing production behavior is preserved

### UC-2: Operator activates a Rotessa recurring schedule for future entries
- **Actor**: Admin operator
- **Precondition**: Mortgage is eligible for provider-managed PAD collection, has exactly one linked borrower with `role === "primary"`, and future plan entries exist
- **Flow**:
  1. Operator selects a mortgage and a group of future plan entries
  2. System validates bank-account / mandate prerequisites
  3. System creates one external Rotessa recurring schedule
  4. System links all covered local plan entries to that schedule and marks them as provider-managed
- **Postcondition**: Future entries are no longer eligible for the internal due-entry runner

### UC-3: Provider reports a monthly occurrence before any local transfer exists
- **Actor**: Rotessa webhook or provider poller
- **Precondition**: A provider-managed recurring schedule is active and a monthly occurrence is reported
- **Flow**:
  1. Provider event is normalized into a local occurrence event
  2. System resolves the covered local plan entry using schedule linkage plus occurrence metadata
  3. System lazily creates or updates the local `collectionAttempt` and `transferRequest`
  4. System fires the mapped transfer transition
- **Postcondition**: The local system re-enters the canonical transfer -> attempt -> obligation -> ledger path without having created monthly transfer rows ahead of time

### UC-4: Provider reports failure or reversal for one occurrence
- **Actor**: Rotessa webhook or poller
- **Precondition**: A provider-managed occurrence has already been materialized locally or can be resolved from schedule metadata
- **Flow**:
  1. Event resolves to one plan entry occurrence
  2. Local `transferRequest` is created or loaded
  3. Transfer machine receives `TRANSFER_FAILED` or `TRANSFER_REVERSED`
  4. Existing attempt and obligation recovery effects run as they do today
- **Postcondition**: Failure and reversal semantics stay canonical and auditable

### UC-5: Mortgage-level cutover affects only future execution, not historical truth
- **Actor**: Admin operator
- **Precondition**: Mortgage has historical app-owned collection history
- **Flow**:
  1. Operator changes the mortgage default execution mode for future periods
  2. Already executed attempts, transfers, and settled obligations remain untouched
  3. Selected future plan entries are explicitly activated onto a provider-managed schedule
- **Postcondition**: Historical app-owned execution and future provider-managed execution can coexist for one mortgage without ambiguity

### UC-6: Poller recovers a missed provider webhook
- **Actor**: Provider-managed schedule poller
- **Precondition**: A Rotessa occurrence exists remotely, the webhook did not reach FairLend, and the external schedule remains active locally
- **Flow**:
  1. Poller selects the external schedule because it is active and due for sync
  2. Poller fetches provider occurrence updates using cursor or bounded date window
  3. Poller normalizes the returned occurrence into the shared local event shape
  4. System resolves the matching plan entry and lazily creates or updates local attempt and transfer rows
  5. Existing transfer, attempt, obligation, and ledger effects run from the mapped transfer transition
- **Postcondition**: Local state converges to the provider-reported occurrence outcome without operator intervention

## Operational Model

### Runtime ownership split
- `executionMode = app_owned`
  - the existing collection-plan runner owns due-entry execution
- `executionMode = provider_managed`
  - webhooks and the provider-managed poller own occurrence ingestion

### Production cron topology
- Keep the existing app-owned cron:
  - `collection plan execution spine`
  - executes only `collectionPlanEntries(status=planned, executionMode=app_owned)`
- Add a new provider-managed cron:
  - `provider-managed schedule polling spine`
  - polls active external schedules and due or recently due provider-managed occurrences

### Polling intent
- Webhook remains the primary real-time path.
- Polling exists to:
  - recover missed webhooks
  - synchronize provider status drift
  - surface schedule health

### Rotessa status expectations
- The first delivery must preserve the raw Rotessa lifecycle values:
  - `Future`
  - `Pending`
  - `Approved`
  - `Declined`
- The local system still maps those statuses into canonical transfer events for settlement behavior.

## Definition of Done
- Schema changes support mortgage-level execution ownership, plan-entry ownership snapshotting, external schedule linkage, and provider status mirroring.
- The app-owned runner cannot execute provider-managed plan entries even if their status is mispatched.
- A separate provider-managed poller cron exists and is wired in `convex/crons.ts`.
- Webhook and poller both call the same normalized occurrence-ingestion path.
- Polling fallback can recover a missed webhook for both happy-path settlement and decline paths such as NSF.
- Operators can inspect schedule sync health and linked local entries from query surfaces.
- Automated tests cover mixed portfolios, webhook-first flows, poller fallback flows, idempotency, and raw provider status mirroring.

## Schemas

### Existing entities that remain canonical
- `obligations`
  - borrower debt truth
  - unchanged by this feature
- `collectionPlanEntries`
  - one local row per collectible occurrence
  - still the local source of truth for planned collection intent
- `collectionAttempts`
  - one local row per realized occurrence execution
  - still the AMPS-owned business execution record
- `transferRequests`
  - one local row per realized rail movement
  - still the Unified Payment Rails-owned transfer execution record

### New entity
- provider-managed recurring schedule aggregate
  - stores one external schedule reference before any per-occurrence local transfer exists
  - links back to the owning mortgage and the selected future plan entries

### Existing entities that need extension
- `mortgages`
  - needs a default collection execution mode
- `collectionPlanEntries`
  - need external-schedule linkage and an externally managed execution state
- `collectionAttempts`
  - need provider webhook / poller trigger-source support for lazily materialized attempts

## Out of Scope
- Replacing the existing internal app-owned execution spine
- Modeling provider-owned debt schedules or provider-owned obligations
- Creating local monthly `transferRequests` for all future externally managed entries at activation time
- Full provider schedule editing workflows after activation
- Provider-specific UI beyond the minimum operator controls and visibility needed for activation and diagnostics
- Providers beyond Rotessa in the initial delivery, though the design should remain provider-agnostic
