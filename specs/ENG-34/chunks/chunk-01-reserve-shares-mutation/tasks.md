# Chunk 01: reserve-shares-mutation

- [x] T-001: Add `reserveShares` to `convex/ledger/mutations.ts` as an `internalMutation` using `reserveSharesArgsValidator` and the existing ledger helpers/import conventions.
- [x] T-002: Implement `reserveShares` idempotency replay by looking up the existing journal entry via `by_idempotency`, resolving the linked pending reservation, and returning the original `{ reservationId, journalEntry }` result with zero side effects.
- [x] T-003: Implement the reservation write path in `convex/ledger/mutations.ts`: resolve seller and buyer POSITION accounts, call `postEntry` with `SHARES_RESERVED` before mutating pending fields, increment `seller.pendingCredits` and `buyer.pendingDebits`, insert the `ledger_reservations` row, backfill `journalEntry.reservationId`, and return `{ reservationId, journalEntry }`.
- [x] T-004: Preserve downstream contract requirements in `reserveShares`: use the canonical `sellerLenderId` / `buyerLenderId` field names, persist optional `dealId`, rely on `postEntry` for same-account / min-fraction / available-balance enforcement, and expose the mutation at `internal.ledger.mutations.reserveShares` for Deal Closing effects.
