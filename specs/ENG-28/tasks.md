# Tasks: ENG-28 — Implement account helper functions (create, lookup, balance calculations)

Source: Linear ENG-28, Notion implementation plan
Generated: 2026-03-16

## Phase 1: Schema
- [x] T-001: Add `pendingCredits: v.optional(v.int64())` to `ledger_accounts` table in `convex/schema.ts`. Run `bunx convex codegen`.

## Phase 2: Create accounts.ts
- [x] T-002: Create `convex/ledger/accounts.ts` with `getPostedBalance(account)` and `getAvailableBalance(account)` pure functions. `getPostedBalance` = `cumulativeDebits - cumulativeCredits`. `getAvailableBalance` = posted - (pendingCredits ?? 0n).
- [x] T-003: Add `getWorldAccount(ctx)` to `accounts.ts` — read-only query that throws if WORLD not found. Add `initializeWorldAccount(ctx)` — idempotent create (adapted from existing `getOrCreateWorldAccount`).
- [x] T-004: Add `getTreasuryAccount(ctx, mortgageId)` to `accounts.ts` — returns `Doc<"ledger_accounts"> | null` (changed from throw behavior).
- [x] T-005: Move `getPositionAccount(ctx, mortgageId, lenderId)` and `getOrCreatePositionAccount(ctx, mortgageId, lenderId)` to `accounts.ts` with same logic.

## Phase 3: Update consumers
- [x] T-006: Update `convex/ledger/internal.ts` — remove all migrated functions, keep only `nextSequenceNumber`. (No re-exports — biome noBarrelFile lint rule prohibits barrel exports; all consumers updated to import directly from `./accounts`.)
- [x] T-007: Update `convex/ledger/mutations.ts` — change imports from `./internal` to `./accounts`. Replace `getOrCreateWorldAccount` → `initializeWorldAccount`. Add null-checks for `getTreasuryAccount` calls (now returns null). Replace `computeBalance` → `getPostedBalance`.
- [x] T-008: Update `convex/ledger/queries.ts` — replace `computeBalance` import from `./internal` with `getPostedBalance` from `./accounts`.
- [x] T-009: Update `convex/ledger/validation.ts` — replace `computeBalance` import from `./internal` with `getPostedBalance` from `./accounts`.

## Phase 4: Tests
- [x] T-010: Create `convex/ledger/__tests__/accounts.test.ts` with 14 unit tests covering all helpers.
- [x] T-011: Verified `ledger.test.ts` has no broken references to renamed functions.

## Phase 5: Verify
- [x] T-012: `bun check` clean, `bun typecheck` clean, `bun run test` — all 14 new tests pass.
