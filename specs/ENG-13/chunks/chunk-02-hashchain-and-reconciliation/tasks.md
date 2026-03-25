# Chunk 02: Hash-Chain Function and Reconciliation

- [x] T-005: Create `convex/engine/hashChain.ts` with `hashChainJournalEntry` as `internalMutation`. Accepts `{ journalEntryId: v.id("auditJournal") }`. Reads journal entry via `ctx.db.get()`, transforms to `auditTrail.insert()` args (previousState → beforeState, newState → afterState, extra fields packed into metadata JSON), wraps in try/catch (fire-and-forget — logs error, never throws).
- [x] T-006: Create `convex/engine/reconciliation.ts` with `reconcile` query. For each entity type in ENTITY_TABLE_MAP: query auditJournal by entity type, find latest "transitioned" entry per entity, compare entity.status with journal.newState, record discrepancies. Skip entity types with no journal entries (handles missing tables). Return `{ checkedAt, discrepancies, isHealthy }`.
- [x] T-007: Run `bun check`, `bun typecheck`. Fix any issues. Document expected type errors in transition.ts (old AuditJournalEntry shape — ENG-12 fixes).
