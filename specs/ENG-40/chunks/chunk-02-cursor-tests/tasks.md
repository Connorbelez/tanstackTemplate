# Chunk 02: Cursor Test Coverage

- [ ] T-007: Remove the legacy cursor lifecycle assertions from `convex/ledger/__tests__/ledger.test.ts` so that the cursor contract lives in one dedicated test file
- [ ] T-008: Create `convex/ledger/__tests__/cursors.test.ts` with the shared ledger test harness and sequence counter bootstrap
- [ ] T-009: Cover the full SPEC §6.7 scenario: register, post 5 entries, poll, advance to 3, post 2 more, poll 4-7, advance to 7, poll empty, new cursor replays all
- [ ] T-010: Cover edge cases: idempotent registration, missing cursor errors, invalid sequence rejection, batch size limiting, and `hasMore`
- [ ] T-011: Run `bunx convex codegen && bun check && bun typecheck && bun test`
