# Chunk 02: Reservation Lifecycle Tests

- [x] T-005: Add test helpers for commitReservation and voidReservation to `convex/ledger/__tests__/reservation.test.ts`
- [x] T-006: Test: reserve → commit happy path (posted balances change, pending zeroed, reservation status=committed)
- [x] T-007: Test: reserve → void happy path (available restored, no cumulative changes, reservation status=voided)
- [x] T-008: Test: double-commit returns ConvexError, zero side effects
- [x] T-009: Test: double-void returns ConvexError, zero side effects
- [x] T-010: Test: commit-after-void returns ConvexError, zero side effects
- [x] T-011: Test: void-after-commit returns ConvexError, zero side effects
- [x] T-012: Run `bun run test` — all tests pass
