# Chunk 01: Schema & Refactor

- [ ] T-001: Add `pendingCredits: v.optional(v.int64())` to `ledger_accounts` table in `convex/schema.ts`. Run `bunx convex codegen`.
- [ ] T-002: Create `convex/ledger/accounts.ts` with `getPostedBalance(account)` and `getAvailableBalance(account)` pure functions.
- [ ] T-003: Add `getWorldAccount(ctx)` (read-only, throws if not found) and `initializeWorldAccount(ctx)` (idempotent create) to `accounts.ts`.
- [ ] T-004: Add `getTreasuryAccount(ctx, mortgageId)` to `accounts.ts` — returns `Doc<"ledger_accounts"> | null` (changed from throw behavior).
- [ ] T-005: Move `getPositionAccount` and `getOrCreatePositionAccount` to `accounts.ts` with same logic.
- [ ] T-006: Update `convex/ledger/internal.ts` — remove migrated functions, keep `nextSequenceNumber`. Consumers import directly from `./accounts` (no barrel re-exports; Biome `noBarrelFile` rule).
- [ ] T-007: Update `convex/ledger/mutations.ts` — new imports, null-check getTreasuryAccount, rename computeBalance → getPostedBalance.
- [ ] T-008: Update `convex/ledger/queries.ts` — replace `computeBalance` with `getPostedBalance` from `./accounts`.
- [ ] T-009: Update `convex/ledger/validation.ts` — replace `computeBalance` with `getPostedBalance` from `./accounts`.
