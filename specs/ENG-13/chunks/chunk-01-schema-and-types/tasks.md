# Chunk 01: Schema and Types

- [ ] T-001: Add `auditJournal` table to `convex/schema.ts` with 16 fields (entityType, entityId, eventType, payload, previousState, newState, outcome, reason, actorId, actorType, channel, ip, sessionId, machineVersion, effectsScheduled, timestamp) and 3 indexes (by_entity, by_actor, by_type_and_time). Place after `onboardingRequests` with section comment.
- [ ] T-002: Update `AuditJournalEntry` interface in `convex/engine/types.ts` — flatten `source: CommandSource` to individual top-level fields (actorId: string, actorType?: ActorType, channel: CommandChannel, ip?: string, sessionId?: string), add `effectsScheduled?: string[]`, update comment on line 43 to accurately describe the table.
- [ ] T-003: Add `ENTITY_TABLE_MAP` constant to `convex/engine/types.ts` — maps EntityType to Convex table name (`onboardingRequest → "onboardingRequests"`, `mortgage → "mortgages"`, `obligation → "obligations"`). Use `as const satisfies Record<EntityType, string>`.
- [ ] T-004: Run `bunx convex codegen` to regenerate types for the new `auditJournal` table.
