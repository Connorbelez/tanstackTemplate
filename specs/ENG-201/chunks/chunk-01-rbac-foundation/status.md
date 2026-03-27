# Chunk 1 Status

## Completed Tasks
- T-001: Added WorkOS permission registration checklist at `specs/ENG-201/workos-permissions.md`
- T-002: Added payment permission chains in `convex/fluent.ts`
- T-003: Migrated transfer entrypoints in `convex/payments/transfers/mutations.ts` to payment permission gates

## Quality Gate
- `bun check`: passed (repo has existing complexity warnings unrelated to this chunk)
- `bun typecheck`: passed
- `bunx convex codegen`: blocked (`No CONVEX_DEPLOYMENT set`)

## Notes
- Added `requirePermissionAction()` to support action-level permission checks without query/mutation `db` context.
- Fixed unrelated pre-existing typecheck path issue in `convex/payments/cashLedger/__tests__/chaosTests.test.ts` (`./e2eHelpers` -> `./e2eHelpers.test-utils`).
