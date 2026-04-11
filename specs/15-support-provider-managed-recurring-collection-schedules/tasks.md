# 15. Support Provider-Managed Recurring Collection Schedules — Master Task List

## Chunk 1: Schema, Validators, and Shared Types
- [ ] T-001: Add `mortgages.collectionExecutionMode`, `collectionExecutionProviderCode`, `activeExternalCollectionScheduleId`, and audit timestamps to `convex/schema.ts`
- [ ] T-002: Add `externalCollectionSchedules` table with schedule status, cursor, poll-health, and lease fields to `convex/schema.ts`
- [ ] T-003: Extend `collectionPlanEntries` with `executionMode`, external schedule linkage, provider mirror fields, and `provider_scheduled` status in `convex/schema.ts`
- [ ] T-004: Extend `collectionAttempts` with provider webhook/poller trigger-source support and raw provider mirror fields in `convex/schema.ts`
- [ ] T-005: Add validators and TypeScript types for recurring schedule provider contracts and normalized occurrence events

## Chunk 2: Provider Contracts and Rotessa Adapter
- [ ] T-006: Introduce `RecurringCollectionScheduleProvider` alongside the existing occurrence-scoped `TransferProvider`
- [ ] T-007: Implement Rotessa recurring schedule adapter with `createSchedule`, `cancelSchedule`, `getScheduleStatus`, and `pollOccurrenceUpdates`
- [ ] T-008: Normalize Rotessa raw lifecycle values `Future`, `Pending`, `Approved`, and `Declined` into the shared occurrence event contract while preserving the raw values locally
- [ ] T-009: Register the Rotessa recurring schedule adapter in the provider registry without changing existing app-owned transfer initiation behavior

## Chunk 3: Activation and Ownership Isolation
- [ ] T-010: Implement two-phase activation for one provider-managed schedule covering a selected set of future plan entries
- [ ] T-011: Patch covered entries to `executionMode = provider_managed`, `status = provider_scheduled`, and deterministic occurrence ordinal linkage
- [ ] T-012: Persist activation idempotency keys and recovery-safe local schedule records
- [ ] T-013: Update app-owned due-entry queries and helpers so they defensively require `executionMode = app_owned`

## Chunk 4: Shared Occurrence Ingestion
- [ ] T-014: Implement one normalized occurrence-ingestion action used by both webhooks and polling
- [ ] T-015: Implement deterministic occurrence resolution order:
  1. existing transfer by `providerCode + providerRef`
  2. plan entry by `externalOccurrenceRef`
  3. plan entry by `externalCollectionScheduleId + externalOccurrenceOrdinal`
  4. plan entry by `externalCollectionScheduleId + scheduledDate`
- [ ] T-016: Lazily create or load `collectionAttempt` and `transferRequest` per provider occurrence idempotently
- [ ] T-017: Mirror raw provider status and reason to local occurrence records before firing mapped transfer transitions

## Chunk 5: Polling Spine and Recovery
- [ ] T-018: Create `provider-managed schedule polling spine` internal action and register it in `convex/crons.ts`
- [ ] T-019: Implement schedule claiming with lease fields so concurrent cron runs cannot poll the same schedule simultaneously
- [ ] T-020: Implement cursor-based polling with bounded fallback window for providers that do not support reliable cursors
- [ ] T-021: Update schedule sync health fields (`lastSyncedAt`, `lastSyncCursor`, `lastSyncErrorAt`, `consecutiveSyncFailures`, `nextPollAt`) on success and failure
- [ ] T-022: Ensure the poller recovers missed webhook occurrences without ever calling `executePlanEntry`

## Chunk 6: Webhook Integration
- [ ] T-023: Extend the Rotessa webhook handler to use the shared occurrence-ingestion path after transfer-centric lookup misses
- [ ] T-024: Preserve current transfer-centric behavior for already-materialized occurrences
- [ ] T-025: Record whether each occurrence update was ingested via webhook or poller

## Chunk 7: Query Surfaces and Operator Diagnostics
- [ ] T-026: Add queries for external schedules by mortgage, linked entries, sync health, and last provider status
- [ ] T-027: Add admin diagnostics for unresolved occurrence matching and schedule sync failures
- [ ] T-028: Expose sufficient read models for tests and operator tooling without requiring raw provider payload inspection

## Chunk 8: Tests
- [ ] T-029: Add schema-level tests for new status validators, ownership fields, and provider mirror fields
- [ ] T-030: Add runner tests proving app-owned cron skips provider-managed entries even when dates are due
- [ ] T-031: Add activation tests proving one external schedule covers many future entries deterministically
- [ ] T-032: Add webhook tests covering `Future -> Pending -> Approved` happy path and `Declined` / NSF failure path
- [ ] T-033: Add poller tests covering the same lifecycle with mocked Rotessa polling responses
- [ ] T-034: Add fallback tests where webhook is absent and the polling cron recovers both settlement and decline outcomes
- [ ] T-035: Add idempotency tests for repeated webhook events, repeated poll results, and webhook-plus-poller convergence on the same occurrence
- [ ] T-036: Add mixed-portfolio tests proving app-owned and provider-managed mortgages operate in parallel without cross-talk

## Chunk 9: Verification
- [ ] T-037: Run `bun check`
- [ ] T-038: Run `bun typecheck`
- [ ] T-039: Run `bunx convex codegen`
- [ ] T-040: Run targeted Vitest suites for recurring schedule activation, webhook ingestion, polling ingestion, and cron fallback
