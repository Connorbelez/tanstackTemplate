# Chunk 02 Status

## Result
Implemented in `convex/ledger/__tests__/cursors.test.ts` and `convex/ledger/__tests__/ledger.test.ts`.

## Completed
- Removed the old shallow cursor lifecycle assertions from `ledger.test.ts`
- Added a dedicated cursor test file
- Covered the full replay / poll / advance scenario from SPEC §6.7
- Covered idempotent registration, missing cursor failures, invalid sequence rejection, batch size limiting, and `hasMore`

## Quality Gate
- `bun check`: passed
- `bun typecheck`: passed
- `bunx vitest run convex/ledger/__tests__/cursors.test.ts`: passed
- `bunx vitest run convex/ledger/__tests__/ledger.test.ts`: passed

## Blockers
- `bunx convex codegen`: blocked by missing `CONVEX_DEPLOYMENT`
- `bun test`: not a reliable issue-level gate in this repo right now; unrelated repo-wide failures remain in the wider test suite, and direct Bun execution of some Convex tests fails on `import.meta.glob`
