# Chunk 1: Foundation, Audit Support & Profile Seeds

- [x] T-001: Create `convex/seed/seedHelpers.ts` with shared seed constants, Canadian fixture helpers, timestamp helpers, idempotent lookups, `writeCreationJournalEntry`, and `writeSyntheticJournalTrail` built on `appendAuditJournalEntry`
- [x] T-002: Extend GT audit typing so lender seed journal entries are first-class by adding `"lender"` support where required in `convex/engine/types.ts`, `convex/engine/validators.ts`, and any related entity table maps
- [x] T-003: Create `convex/seed/seedBroker.ts` as an `adminMutation` that idempotently seeds 2 brokers, required `users` rows, and any brokerage org records needed by local schema fields
- [x] T-004: Create `convex/seed/seedBorrower.ts` as an `adminMutation` that idempotently seeds 5 borrowers plus their `users` rows with realistic Ontario borrower profiles
- [x] T-005: Create `convex/seed/seedLender.ts` as an `adminMutation` that idempotently seeds 3 lenders plus their `users` rows, taking broker IDs and matching the existing `lenders` table shape
