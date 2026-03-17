# ENG-40 — Consumer Cursor Infrastructure: Master Task List

## Chunk 1: Cursor API Refactor
- [x] T-001: Refactor `convex/ledger/cursors.ts` to use shared lookup helpers instead of repeated inline cursor queries
- [x] T-002: Add `registerCursor(consumerId)` as an idempotent `ledgerMutation` that returns the existing or newly created cursor `_id`
- [x] T-003: Add `getNewEntries(consumerId, batchSize?)` as a `ledgerQuery` over `ledger_journal_entries.by_sequence`, ordered ascending and limited by batch size
- [x] T-004: Update `advanceCursor(consumerId, lastProcessedSequence)` to require an existing cursor and validate that non-zero sequence numbers exist before patching
- [x] T-005: Keep `getCursor`/`resetCursor` aligned with the new helper layer and preserve explicit reset-to-sequence semantics
- [ ] T-006: Run `bunx convex codegen && bun check && bun typecheck`

## Chunk 2: Cursor Test Coverage
- [x] T-007: Remove the legacy cursor lifecycle assertions from `convex/ledger/__tests__/ledger.test.ts` so that the cursor contract lives in one dedicated test file
- [x] T-008: Create `convex/ledger/__tests__/cursors.test.ts` with the shared ledger test harness and sequence counter bootstrap
- [x] T-009: Cover the full SPEC §6.7 scenario: register, post 5 entries, poll, advance to 3, post 2 more, poll 4-7, advance to 7, poll empty, new cursor replays all
- [x] T-010: Cover edge cases: idempotent registration, missing cursor errors, invalid sequence rejection, batch size limiting, and `hasMore`
- [ ] T-011: Run `bunx convex codegen && bun check && bun typecheck && bun test`
