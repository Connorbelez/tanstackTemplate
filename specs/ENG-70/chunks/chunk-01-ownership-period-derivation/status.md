# Chunk 01: ownership-period-derivation — Status

Completed: 2026-03-19

## Tasks Completed
- [x] T-001: Create `convex/accrual/ownershipPeriods.ts` exporting `getOwnershipPeriods(ctx, mortgageId, lenderId): Promise<OwnershipPeriod[]>` as a pure read helper with injected `{ db }` access only.
- [x] T-002: Resolve the lender's `POSITION` account using the actual ledger schema and compatibility helpers: query `ledger_accounts` via `by_mortgage_and_lender`, tolerate legacy ownership rows through `getAccountLenderId`, and return `[]` when the lender has no position for the mortgage.
- [x] T-003: Query debit and credit journal entries from `ledger_journal_entries`, merge and deduplicate them, exclude audit-only entries (`SHARES_RESERVED`, `SHARES_VOIDED`), and sort deterministically by `sequenceNumber`.
- [x] T-004: Build ownership periods from running balance changes using `dayAfter()` and `dayBefore()`, with the closing-date rule preserved: seller keeps `SHARES_COMMITTED.effectiveDate`, buyer starts the next day, full exits close the previous period, and each period fraction is `Number(balance) / Number(TOTAL_SUPPLY)`.
- [x] T-005: Create `convex/accrual/__tests__/ownershipPeriods.test.ts` with `convex-test` coverage for single-owner issuance, deal-close transfer proration boundaries, multiple sequential transfers, full exit, and ignored audit-only entries.

## Tasks Incomplete
- [ ] T-006: Run the quality gate required by repo policy: `bun check`, `bun typecheck`, and `bunx convex codegen`. `bun check` now passes, but the remaining gate is blocked by unrelated pre-existing repo type errors and missing Convex deployment configuration.

## Quality Gate
- `bun check`: pass
- `bun typecheck`: fail
- `bunx convex codegen`: fail
- Targeted verification: `bunx vitest run convex/accrual/__tests__/ownershipPeriods.test.ts` passed

## Notes
- The helper and tests are implemented against the repo's actual ledger schema and mutation names.
- `bun test` is not a valid runner for these test files here because `import.meta.glob` is only supported under the Vite/Vitest toolchain used by this repo.
- `bun typecheck` currently fails outside ENG-70 in existing files including `convex/deals/__tests__/access.test.ts`, `convex/deals/__tests__/dealClosing.test.ts`, `convex/deals/__tests__/effects.test.ts`, `convex/ledger/__tests__/ledger.test.ts`, `src/components/admin/deal-card.tsx`, `src/routes/demo/convex-ledger.tsx`, and `src/routes/demo/prod-ledger.tsx`.
- `bunx convex codegen` currently fails with `No CONVEX_DEPLOYMENT set, run "npx convex dev" to configure a Convex project`.
