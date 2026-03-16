# Tasks: ENG-13 — Implement Audit Journal Schema and Layer 2 Hash-Chaining

Source: Linear ENG-13, Notion implementation plan
Generated: 2026-03-15

## Phase 1: Schema & Types

- [x] T-001: Add `auditJournal` table to `convex/schema.ts` with 16 fields (entityType, entityId, eventType, payload, previousState, newState, outcome, reason, actorId, actorType, channel, ip, sessionId, machineVersion, effectsScheduled, timestamp) and 3 indexes (by_entity, by_actor, by_type_and_time). Place after `onboardingRequests` with section comment.
- [x] T-002: Update `AuditJournalEntry` interface in `convex/engine/types.ts` — flatten `source: CommandSource` to individual top-level fields (actorId: string, actorType?: ActorType, channel: CommandChannel, ip?: string, sessionId?: string), add `effectsScheduled?: string[]`, update comment on line 43 to accurately describe the table.
- [x] T-003: Add `ENTITY_TABLE_MAP` constant to `convex/engine/types.ts` — maps EntityType to Convex table name (`onboardingRequest → "onboardingRequests"`, `mortgage → "mortgages"`, `obligation → "obligations"`). Use `as const satisfies Record<EntityType, string>`.
- [x] T-004: Run `bunx convex codegen` to regenerate types for the new `auditJournal` table.

## Phase 2: Hash-Chain Function & Reconciliation

- [x] T-005: Create `convex/engine/hashChain.ts` with `hashChainJournalEntry` as `internalMutation`. Accepts `{ journalEntryId: v.id("auditJournal") }`. Reads journal entry via `ctx.db.get()`, transforms to `auditTrail.insert()` args (previousState → beforeState, newState → afterState, extra fields packed into metadata JSON), wraps in try/catch (fire-and-forget — logs error, never throws).
- [x] T-006: Create `convex/engine/reconciliation.ts` with `reconcile` query. For each entity type in ENTITY_TABLE_MAP: query auditJournal by entity type, find latest "transitioned" entry per entity, compare entity.status with journal.newState, record discrepancies. Skip entity types with no journal entries (handles missing tables). Return `{ checkedAt, discrepancies, isHealthy }`.

## Phase 3: Quality Gate

- [x] T-007: Run `bun check`, `bun typecheck`. Fix any issues. Document expected type errors in transition.ts (old AuditJournalEntry shape — ENG-12 fixes).
