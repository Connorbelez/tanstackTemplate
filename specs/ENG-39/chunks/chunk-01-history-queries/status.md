# Chunk 1: History Queries Hardening & Verification — Status

Completed: 2026-03-16 21:50 EDT

## Tasks Completed
- [x] T-001: Added `limit ?? 100` default handling to `getAccountHistory` in `convex/ledger/queries.ts`
- [x] T-002: Added `limit ?? 100` default handling to `getMortgageHistory` in `convex/ledger/queries.ts`
- [x] T-003: Added `T-070c` coverage in `convex/ledger/__tests__/ledger.test.ts` to verify both history queries cap omitted-limit responses at 100 entries

## Tasks Incomplete
- [ ] T-004: `bunx convex codegen` could not be executed in this worktree because `CONVEX_DEPLOYMENT` is not configured locally

## Quality Gate
- `bun check`: pass
- `bun typecheck`: pass
- `bun run test -- convex/ledger/__tests__/ledger.test.ts`: pass
- `bunx convex codegen`: blocked by missing `CONVEX_DEPLOYMENT`

## Notes
- The linked Notion implementation plan was stale relative to the repo: both history queries and their core ordering/filtering tests already existed.
- The remaining code change for `ENG-39` was the default-limit behavior required by the Linear issue and REQ-72 retention constraints.
