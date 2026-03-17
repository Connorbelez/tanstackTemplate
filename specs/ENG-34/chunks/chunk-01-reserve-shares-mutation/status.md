# Chunk 01: reserve-shares-mutation — Status

Completed: 2026-03-16 22:03 America/Toronto

## Tasks Completed
- [x] T-001: Added `reserveShares` as an `internalMutation` in `convex/ledger/mutations.ts`.
- [x] T-002: Added idempotency replay via `ledger_journal_entries.by_idempotency` plus linked reservation lookup.
- [x] T-003: Implemented the reservation flow: `SHARES_RESERVED` journal entry first, then pending field locks, reservation insert, and journal backfill.
- [x] T-004: Preserved the `sellerLenderId` / `buyerLenderId` contract and returned `{ reservationId, journalEntry }`.

## Tasks Incomplete
- [ ] None in code. Chunk marked partial because one quality-gate command is blocked by environment.

## Quality Gate
- `bun check`: pass
- `bun typecheck`: pass
- `bunx convex codegen`: fail — `No CONVEX_DEPLOYMENT set, run \`npx convex dev\` to configure a Convex project`

## Notes
- The repo does not contain a checked-in `.env.local`, `.env`, or other safe local Convex deployment binding.
- `reserveShares` was implemented in `convex/ledger/mutations.ts` inline with the existing flat mutation structure instead of creating a new `mutations/` subdirectory.
