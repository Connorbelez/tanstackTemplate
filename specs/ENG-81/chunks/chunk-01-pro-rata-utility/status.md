# Chunk 01: pro-rata-utility — Status

Completed: 2026-03-19

## Tasks Completed
- [x] T-001: Added shared `ProRataPosition` and `PositionShare` interfaces in `convex/accrual/types.ts`.
- [x] T-002: Implemented `calculateProRataShares` in `convex/accrual/interestMath.ts` using integer-cent largest-remainder allocation with deterministic tie-breaking.
- [x] T-003: Adapted the helper to repo naming and ids (`lenderId`, `Id<"ledger_accounts">`, `Id<"lenders">`) while preserving the rounded-sum invariant.
- [x] T-004: Extended `convex/accrual/__tests__/interestMath.test.ts` with ENG-81 acceptance cases, tie-break behavior, input-order preservation, and guard-rail coverage.
- [x] T-005: `bun check`
- [x] T-006: `bun typecheck`
- [x] T-007: `bunx convex codegen`

## Quality Gate
- `bun test convex/accrual/__tests__/interestMath.test.ts`: pass
- `bun check`: pass
- `bun typecheck`: pass
- `bunx convex codegen`: pass

## Notes
- `.env.local` was copied from `/Users/connor/Dev/tanstackFairLend/fairlendapp` so this worktree had the required `CONVEX_DEPLOYMENT` for Convex codegen.
- The repo-wide type errors were fixed in the affected test and frontend files before the final verification pass.
- The new helper returns shares in the original input order even though cent allocation is ranked by remainder, units, and original index for deterministic behavior.
