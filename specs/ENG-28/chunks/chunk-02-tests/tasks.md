# Chunk 02: Tests

- [ ] T-010: Create `convex/ledger/__tests__/accounts.test.ts` with unit tests for all account helpers: getPostedBalance (zero, positive, negative), getAvailableBalance (with/without pendingCredits), getWorldAccount (throws when missing), initializeWorldAccount (creates + idempotent), getTreasuryAccount (null when missing, returns when exists), getOrCreatePositionAccount (creates + returns existing).
- [ ] T-011: Update existing `convex/ledger/__tests__/ledger.test.ts` — verify no broken references to renamed functions.
- [ ] T-012: Run `bunx convex codegen`, `bun check`, `bun typecheck`, `bun run test` — all must pass.
