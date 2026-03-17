# Chunk 01: deal-seed-runtime — Status

Completed: 2026-03-17 09:11 America/Toronto

## Tasks Completed
- [x] T-001: Switched compound deal status serialization to dot-notation so persisted seeded deal states can rehydrate through the existing transition engine path.
- [x] T-002: Added deal audit/version support and a mortgage-plus-buyer idempotency lookup helper to `convex/seed/seedHelpers.ts`.
- [x] T-003: Created `convex/seed/seedDeal.ts` with three idempotent deal fixtures, placeholder reservation IDs for mid-phase records, and synthetic audit journal trails.
- [x] T-004: Wired deal seeding into `convex/seed/seedAll.ts` and exposed created/reused deal counts in the seed summary.
- [x] T-005: Extended `src/test/convex/seed/seedAll.test.ts` to validate deal counts, exact statuses, mortgage/lender references, audit-journal alignment, and deal-machine rehydration.

## Tasks Incomplete
- [ ] None.

## Quality Gate
- `bun check`: pass
- `bun run test -- src/test/convex/seed/seedAll.test.ts`: pass
- `bun typecheck`: fail
- `bunx convex codegen`: fail

## Notes
- `bun typecheck` currently fails in pre-existing ledger and demo files outside the ENG-47 change set, including `convex/ledger/__tests__/*`, `convex/ledger/mutations.ts`, and `src/routes/demo/prod-ledger.tsx`.
- `bunx convex codegen` is blocked because this worktree does not have `CONVEX_DEPLOYMENT` configured.
