# Chunk 02 Context: Cursor Test Coverage

## What This Chunk Does
Add dedicated cursor tests that prove the downstream polling contract from SPEC §6.7 and remove the old shallow cursor assertions from `ledger.test.ts`.

## Existing Test Infrastructure

### Existing Files
- `convex/ledger/__tests__/ledger.test.ts`
- `convex/ledger/__tests__/sequenceCounter.test.ts`
- `convex/ledger/__tests__/postEntry.test.ts`

The ledger test suite already uses separate focused files, so `cursors.test.ts` fits current repo structure better than extending the single legacy assertion block in `ledger.test.ts`.

### Shared Harness Pattern
Reuse the existing setup from other ledger tests:
```ts
const modules = import.meta.glob("/convex/**/*.ts");
const t = convexTest(schema, modules);
const auth = t.withIdentity(LEDGER_TEST_IDENTITY);
```

### Required Bootstrap
All journal-writing tests must initialize the sequence counter first:
```ts
await auth.mutation(api.ledger.sequenceCounter.initializeSequenceCounter, {});
```

### Useful Existing Mutations / Queries
- `api.ledger.mutations.mintMortgage`
- `api.ledger.mutations.issueShares`
- `api.ledger.mutations.transferShares`
- `api.ledger.cursors.registerCursor` (to be added in chunk 01)
- `api.ledger.cursors.getCursor`
- `api.ledger.cursors.getNewEntries` (to be added in chunk 01)
- `api.ledger.cursors.advanceCursor`

## SPEC §6.7 Scenario to Encode
1. Register cursor for `accrual_engine`
2. Post 5 journal entries
3. `getNewEntries` returns all 5
4. Advance cursor to sequence `3`
5. Post 2 more entries
6. `getNewEntries` returns entries `4-7`
7. Advance cursor to `7`
8. `getNewEntries` returns empty
9. Register a new cursor for another consumer and verify replay from genesis returns all 7

## Additional Assertions to Cover
- `registerCursor` is idempotent and returns the same `_id`
- `getNewEntries` throws when the cursor is missing
- `advanceCursor` throws when the cursor is missing
- `advanceCursor` rejects a non-existent sequence number
- `batchSize` limits the returned entries
- `hasMore` is `true` when the batch is full and `false` otherwise

## Notes on Entry Creation
Use real ledger mutations so sequence numbers are exercised naturally.
One easy sequence-producing flow:
- `mintMortgage` => sequence 1
- `issueShares` => sequence 2
- `transferShares` => sequence 3
- additional transfers / redeems / issues => subsequent sequences

The exact mutation mix does not matter as long as journal entries exist and the expected sequence ordering is deterministic.
