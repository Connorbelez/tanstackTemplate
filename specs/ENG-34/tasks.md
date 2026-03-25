# Tasks: ENG-34 — Implement reserveShares mutation — two-phase reservation step 1 (lock units)

Source: Linear ENG-34, Notion implementation plan
Generated: 2026-03-16

## Phase 1: Reservation Mutation
- [x] T-001: Add `reserveShares` to [convex/ledger/mutations.ts](/Users/connor/.codex/worktrees/5392/fairlendapp/convex/ledger/mutations.ts) as an `internalMutation` using `reserveSharesArgsValidator` and the existing ledger helpers/import conventions.
- [x] T-002: Implement `reserveShares` idempotency replay by looking up the existing journal entry via `by_idempotency`, resolving the linked pending reservation, and returning the original `{ reservationId, journalEntry }` result with zero side effects.
- [x] T-003: Implement the reservation write path in [convex/ledger/mutations.ts](/Users/connor/.codex/worktrees/5392/fairlendapp/convex/ledger/mutations.ts): resolve seller and buyer POSITION accounts, call `postEntry` with `SHARES_RESERVED` before mutating pending fields, increment `seller.pendingCredits` and `buyer.pendingDebits`, insert the `ledger_reservations` row, backfill `journalEntry.reservationId`, and return `{ reservationId, journalEntry }`.
- [x] T-004: Preserve downstream contract requirements in `reserveShares`: use the canonical `sellerLenderId` / `buyerLenderId` field names, persist optional `dealId`, rely on `postEntry` for same-account / min-fraction / available-balance enforcement, and expose the mutation at `internal.ledger.mutations.reserveShares` for Deal Closing effects.

## Phase 2: Reservation Tests
- [x] T-005: Create [convex/ledger/__tests__/reservation.test.ts](/Users/connor/.codex/worktrees/5392/fairlendapp/convex/ledger/__tests__/reservation.test.ts) with the existing `convex-test` harness, sequence counter bootstrap, and helper setup used by the other ledger test files.
- [x] T-006: Add happy-path tests for `reserveShares`: reservation record created, `SHARES_RESERVED` journal entry created, seller/buyer pending fields updated, cumulatives unchanged, `dealId` persisted, and `journalEntry.reservationId` linked back to the reservation.
- [x] T-007: Add failure and replay coverage for `reserveShares`: insufficient available balance, mutex behavior across multiple deals, seller/buyer min-fraction enforcement, sell-all allowance to zero, and idempotent retry returning the existing reservation without double-locking pending fields.

## Phase 3: Verify
- [ ] T-008: Run `bunx convex codegen`, `bun check`, `bun typecheck`, and `bun test` from [/Users/connor/.codex/worktrees/5392/fairlendapp](/Users/connor/.codex/worktrees/5392/fairlendapp) after implementation.
