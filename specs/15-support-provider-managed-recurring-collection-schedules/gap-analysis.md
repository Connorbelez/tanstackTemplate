# 15. Support Provider-Managed Recurring Collection Schedules — Gap Analysis

## Current Repo Truth

### What already fits the target design
- Obligations are already generated locally and remain the source of debt truth.
- `collectionPlanEntries` already represent one local planned collection occurrence.
- `collectionAttempts` already represent one local business execution occurrence.
- `transferRequests` already represent one local provider-facing rail occurrence.
- The transfer machine already supports asynchronous provider lifecycles:
  - `initiated`
  - `pending`
  - `processing`
  - `confirmed`
  - `failed`
  - `reversed`
- Transfer settlement already fans into:
  - collection-attempt reconciliation
  - obligation payment application
  - cash-ledger posting
- Rotessa webhook code already normalizes provider events into transfer lifecycle events.

### What does not fit the target design yet
- Activation durability still needs hardening around concurrent starts and provider-create / local-commit split-brain failure recovery.
- Occurrence matching should prefer schedule-scoped occurrence references before falling back to global identifiers.
- The Rotessa poll cursor still needs a composite sort key so equal timestamps cannot drop rows.
- The demo workspace reset path and app-owned month advance path need stricter scoping so replacement demos do not leave live background work behind.
- Spec/docs have drifted from implementation details such as the cursorized poll contract and the fact that `externalCollectionSchedules` is directly managed rather than Transition Engine-governed.

## Required Extensions

| Area | Current State | Required Change |
|------|---------------|-----------------|
| Mortgage execution ownership | Implemented | Keep `mortgages.collectionExecutionMode` and `collectionPlanEntries.executionMode` aligned during activation and reseed |
| Schedule-level provider identity | Implemented | Harden concurrent activation checks and recovery flows |
| Plan entry ownership | Implemented | Preserve schedule linkage and cancel or retire stale demo-owned rows on reseed |
| Externally managed entry state | Implemented | Keep `provider_scheduled` isolated from the app-owned runner |
| Pre-transfer occurrence matching | Partially implemented | Prefer schedule-scoped `externalOccurrenceRef` matching before global fallback |
| Lazy local materialization | Implemented | Keep webhook and poller ingestion idempotent under replay |
| Provider surface | Implemented | Add timeout / cursor hardening on live adapters |
| Polling | Implemented | Use composite cursors and poll-health metadata to avoid dropped or stuck schedules |

## Risks To Control

### Double execution
Risk:
- an externally managed plan entry is accidentally picked up by the internal runner

Control:
- add `provider_scheduled`
- snapshot `executionMode`
- defend in runner queries and execution helpers

### Ambiguous occurrence matching
Risk:
- provider event cannot be resolved to exactly one local plan entry

Control:
- deterministic matching order
- explicit unresolved-occurrence audit and operator review path

### Split-brain schedule activation
Risk:
- provider schedule is created externally but local plan-entry linkage finalization fails

Control:
- two-phase activation
- local schedule row in `activating`
- recovery/finalization job

### Duplicate local materialization
Risk:
- replayed webhook or repeated poll creates duplicate attempt or transfer rows

Control:
- provider-occurrence idempotency keys
- reuse existing local rows before creation

### Leaking schedule ownership into debt semantics
Risk:
- external schedule model starts to act like a second debt model

Control:
- keep obligations and plan entries canonical
- model the external schedule as execution ownership only

## Recommended Scope Boundary

### In scope for this workstream
- mortgage-level dual execution modes
- external recurring schedule aggregate
- plan-entry externally managed state
- lazy attempt/transfer materialization from occurrence events
- webhook and poller normalization path
- parallel operation between internal and provider-managed mortgages

### Explicitly out of scope for this workstream
- rewriting the existing internal execution spine
- a full provider-agnostic schedule-editing platform
- provider-owned debt truth
- creating all future transfers at activation time
