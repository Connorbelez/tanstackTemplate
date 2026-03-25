# Chunk 02: reservation-tests-and-verify — Status

Completed: 2026-03-16 22:08 America/Toronto

## Tasks Completed
- [x] T-005: Created `convex/ledger/__tests__/reservation.test.ts` using the existing `convex-test` ledger harness.
- [x] T-006: Added happy-path assertions for reservation creation, pending field locks, audit-only cumulatives, `dealId`, and `journalEntry.reservationId`.
- [x] T-007: Added failure and replay coverage for insufficient balance, mutex behavior, min-fraction enforcement, sell-all, and idempotent retries.

## Tasks Incomplete
- [ ] T-008: Full verification is partial due environment-specific failures outside the ENG-34 change set.

## Quality Gate
- `bun check`: pass
- `bun typecheck`: pass
- `bun x vitest run convex/ledger/__tests__/reservation.test.ts`: pass
- `bun run test`: fail — 948 tests passed, but 3 existing suites fail because `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and `WORKOS_WEBHOOK_SECRET` are not set
- `bunx convex codegen`: fail — `No CONVEX_DEPLOYMENT set, run \`npx convex dev\` to configure a Convex project`

## Notes
- The reservation suite avoids stale generated internal API types by invoking the exported `reserveShares` mutation handler through a typed test helper.
- Running `bun test` directly uses Bun's native test runner and is not the correct verification path for this repo; `bun run test` is the intended Vitest command from `package.json`.
