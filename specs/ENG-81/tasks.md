# Tasks: ENG-81 — Pro-rata share calculation with largest-remainder rounding

Source: Linear ENG-81, Notion implementation plan, SPEC 1.6 §4.3
Generated: 2026-03-19

## Phase 1: Shared Types
- [x] T-001: Add shared pro-rata position/share types in `convex/accrual/types.ts` for `{ accountId: Id<"ledger_accounts">, lenderId: Id<"lenders">, units: number }` input and `{ accountId, lenderId, units, rawAmount, amount }` output so ENG-81 exposes the exact contract ENG-82 and ENG-85 expect.

## Phase 2: Shared Utility
- [x] T-002: Implement `calculateProRataShares` in `convex/accrual/interestMath.ts` using the largest-remainder method from SPEC §4.3: compute exact shares, floor to cents, compute remaining cents from integer-cent totals, sort by remainder descending with deterministic tie-break on largest position, distribute cents, and return shares without internal bookkeeping fields.
- [x] T-003: Keep the helper aligned with current repo conventions by using `lenderId` and `Id<"ledger_accounts">`/`Id<"lenders">` rather than the SPEC’s `investorId`/`Id<"accounts">`, and preserve the sum invariant `shares.reduce((s, x) => s + x.amount, 0) === distributableAmount` to the cent.

## Phase 3: Tests
- [x] T-004: Extend `convex/accrual/__tests__/interestMath.test.ts` with ENG-81 coverage for the listed acceptance cases (`3333/3333/3334` over `$10.00`, `5000/5000` over `$100.01`) plus edge checks that the output sum always equals the distributable amount and that tie-break behavior is deterministic.

## Phase 4: Quality Gate
- [x] T-005: Run `bun check`.
- [x] T-006: Run `bun typecheck`.
- [x] T-007: Run `bunx convex codegen`.
