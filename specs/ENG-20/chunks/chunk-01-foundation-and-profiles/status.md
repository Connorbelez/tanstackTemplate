# Chunk 1: Foundation, Audit Support & Profile Seeds — Status

Completed: 2026-03-16 14:27:14 EDT

## Tasks Completed
- [x] T-001: Create `convex/seed/seedHelpers.ts` with shared seed constants, Canadian fixture helpers, timestamp helpers, idempotent lookups, `writeCreationJournalEntry`, and `writeSyntheticJournalTrail`
- [x] T-002: Extend GT audit typing with `"lender"` support for seed journal entries
- [x] T-003: Create `convex/seed/seedBroker.ts` with idempotent broker, user, and brokerage-organization seeding
- [x] T-004: Create `convex/seed/seedBorrower.ts` with idempotent borrower and user seeding
- [x] T-005: Create `convex/seed/seedLender.ts` with idempotent lender and user seeding plus broker selection

## Tasks Incomplete
- None

## Quality Gate
- `bun check`: pass
- `bun typecheck`: pass
- `bunx convex codegen`: pass

## Notes
- Chunk 1 was implemented by a fresh worker and reviewed in the main thread before the local quality gate.
- The repo drift around lender audit typing was resolved by adding `"lender"` to GT entity unions and validators.
- Supporting brokerage organization rows are seeded to match local `brokers.brokerageOrgId` usage.
