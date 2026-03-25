# Chunk 01: Ownership Period Reconstruction — Status

Completed: 2026-03-19 17:25 America/Toronto

## Tasks Completed
- [x] T-001: Align `convex/accrual/types.ts` with the ledger’s actual identifier conventions so accrual helpers use ledger string keys.
- [x] T-002: Create `convex/accrual/ownershipPeriods.ts` to reconstruct lender ownership periods from ledger journal history with seller-closing-date semantics.
- [x] T-003: Create `convex/accrual/__tests__/ownershipPeriods.test.ts` covering mint/issue, transfers, deterministic reconstruction, and audit-only entries.
- [x] T-004: Create `convex/accrual/__tests__/proration.test.ts` covering seller/buyer proration equivalence.

## Tasks Incomplete
- [ ] None.

## Quality Gate
- `bunx vitest run convex/accrual/__tests__/ownershipPeriods.test.ts convex/accrual/__tests__/proration.test.ts`: pass
- `bun check`: pass
- `bun typecheck`: fail — existing unrelated repo errors in `convex/deals/__tests__/*`, `src/components/admin/deal-card.tsx`, `src/routes/demo/convex-ledger.tsx`, and `src/routes/demo/prod-ledger.tsx`
- `bunx convex codegen`: fail — `CONVEX_DEPLOYMENT` is unset in this environment

## Notes
- Chunk-local implementation is complete and the focused accrual tests pass.
- `convex/dispersal/types.ts` needed a small pre-existing style fix so `bun check` could pass.
- Repo-wide typecheck and Convex codegen are currently blocked outside the accrual slice, so this chunk is marked `partial` at the manifest level even though its scoped tasks are complete.
