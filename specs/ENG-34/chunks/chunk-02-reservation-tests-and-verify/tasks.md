# Chunk 02: reservation-tests-and-verify

- [x] T-005: Create [convex/ledger/__tests__/reservation.test.ts](convex/ledger/__tests__/reservation.test.ts) with the existing `convex-test` harness, sequence counter bootstrap, and helper setup used by the other ledger test files.
- [x] T-006: Add happy-path tests for `reserveShares`: reservation record created, `SHARES_RESERVED` journal entry created, seller/buyer pending fields updated, cumulatives unchanged, `dealId` persisted, and `journalEntry.reservationId` linked back to the reservation.
- [x] T-007: Add failure and replay coverage for `reserveShares`: insufficient available balance, mutex behavior across multiple deals, seller/buyer min-fraction enforcement, sell-all allowance to zero, and idempotent retry returning the existing reservation without double-locking pending fields.
- [ ] T-008: Run `bunx convex codegen`, `bun check`, `bun typecheck`, and `bun test` from the repo root (`./`).
