# Chunk 01 Context: Cursor API Refactor

## What This Chunk Does
Finish the public consumer cursor API in `convex/ledger/cursors.ts` so downstream systems can register, poll, and advance their own journal cursor without the ledger knowing anything about consumer logic.

## Current Code Reality
- `convex/ledger/cursors.ts` already exists.
- It currently exports `getCursor`, `advanceCursor`, and `resetCursor`.
- `advanceCursor` currently upserts a cursor if missing and does **not** validate the target sequence.
- There is no `registerCursor`.
- There is no `getNewEntries`.
- The file currently uses `adminQuery` / `adminMutation`, but the rest of the ledger domain has standardized on `ledgerQuery` / `ledgerMutation`.

## Acceptance Criteria from Linear
- `registerCursor`: creates ledger cursor entry, idempotent, admin-only
- `getNewEntries`: returns entries where `sequenceNumber > cursor.lastProcessedSequence`, ordered by sequence, limited by `batchSize`
- `advanceCursor`: updates cursor position, validates sequence exists
- Replay from genesis: new cursor (`seq=0`) retrieves all entries in order
- Batch polling: configurable batch size for consumer throughput control
- Each consumer owns its cursor; ledger has zero knowledge of consumer logic

## Relevant Product / Spec Context

### ENG-40 Implementation Plan
- The attached plan is directionally correct but slightly stale relative to this repo.
- It assumes `convex/ledger/sequenceCounter.ts` still needs to be created. In this branch it already exists and uses `ledgerMutation`.
- It suggests keeping cursor functions on `adminQuery` / `adminMutation`, but current ledger APIs have already standardized on `ledgerQuery` / `ledgerMutation`.

### UC-OL-02
- Consumer reads entries where `sequenceNumber > cursor.lastProcessedSequence`, ordered ascending
- Consumer advances cursor only after successful processing
- Failed mid-batch processing must not skip entries
- New consumer can replay from genesis by starting at `0`

### Mortgage Ownership Ledger Goal
- Consumer-owned cursors are the subscription mechanism
- The ledger does not manage consumer registration beyond storing cursor position
- `ledger_journal_entries.by_sequence` is the authoritative ordering for downstream consumption

## Relevant Local Files

### `convex/ledger/cursors.ts`
Current behavior:
```ts
export const getCursor = adminQuery ...
export const advanceCursor = adminMutation ... // upserts, no sequence validation
export const resetCursor = adminMutation ...   // resets or inserts at target sequence
```

### `convex/fluent.ts`
The canonical ledger auth chains already exist:
```ts
export const ledgerQuery = authedQuery.use(requirePermission("ledger:view"));
export const ledgerMutation = authedMutation.use(
  requirePermission("ledger:correct")
);
```

### `convex/schema.ts`
Relevant tables and indexes:
```ts
ledger_cursors
  .index("by_consumer", ["consumerId"])

ledger_journal_entries
  .index("by_sequence", ["sequenceNumber"])
```

### `convex/ledger/sequenceCounter.ts`
Already implemented and blocks were resolved:
```ts
export async function getNextSequenceNumber(ctx: MutationCtx): Promise<bigint>
```

## Implementation Notes
- Prefer a small internal helper like `getCursorByConsumerId(ctx, consumerId)` to avoid repeating the `ledger_cursors.by_consumer` query.
- `registerCursor` should return the cursor `_id` both when it inserts and when it finds an existing row.
- `registerCursor` should initialize `lastProcessedSequence` to `0n`.
- `getNewEntries` should throw a structured `ConvexError` when the cursor does not exist.
- `batchSize` should be optional and default to a reasonable limit, likely `100`.
- `getNewEntries` should return enough data for polling ergonomics:
  - `entries`
  - `cursorPosition`
  - `hasMore`
- `advanceCursor` should:
  - throw if cursor does not exist
  - allow `0n` without journal validation
  - validate that any non-zero target sequence exists in `ledger_journal_entries`
  - patch `lastProcessedAt` on success
- `resetCursor` is not in ENG-40 scope, but it already exists and should remain consistent with the shared helper layer.

## Open Decision Already Resolved by Codebase Context
- Use `ledgerQuery` / `ledgerMutation`, not `adminQuery` / `adminMutation`.
Reason: that is the established ledger-domain convention in this repo, and the shared ledger test identity already grants `ledger:view` + `ledger:correct`.
