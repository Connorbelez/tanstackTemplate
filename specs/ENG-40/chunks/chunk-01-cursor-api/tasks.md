# Chunk 01: Cursor API Refactor

- [ ] T-001: Refactor `convex/ledger/cursors.ts` to use shared lookup helpers instead of repeated inline cursor queries
- [ ] T-002: Add `registerCursor(consumerId)` as an idempotent `ledgerMutation` that returns the existing or newly created cursor `_id`
- [ ] T-003: Add `getNewEntries(consumerId, batchSize?)` as a `ledgerQuery` over `ledger_journal_entries.by_sequence`, ordered ascending and limited by batch size
- [ ] T-004: Update `advanceCursor(consumerId, lastProcessedSequence)` to require an existing cursor and validate that non-zero sequence numbers exist before patching
- [ ] T-005: Keep `getCursor`/`resetCursor` aligned with the new helper layer and preserve explicit reset-to-sequence semantics
- [ ] T-006: Run `bunx convex codegen && bun check && bun typecheck`
