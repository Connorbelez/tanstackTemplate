# Chunk 01 Status

## Result
Implemented in `convex/ledger/cursors.ts`.

## Completed
- Switched cursor functions from `adminQuery` / `adminMutation` to `ledgerQuery` / `ledgerMutation`
- Added shared cursor lookup helper
- Added `registerCursor`
- Added `getNewEntries`
- Tightened `advanceCursor` to require an existing cursor and validate target sequence numbers
- Kept `getCursor` and `resetCursor` aligned with the shared helper path

## Quality Gate
- `bun check`: passed
- `bun typecheck`: passed
- `bunx convex codegen`: blocked by missing `CONVEX_DEPLOYMENT` in the local environment

## Notes
- The implementation preserves `resetCursor`'s insert-if-missing behavior while adding sequence validation for non-zero targets.
