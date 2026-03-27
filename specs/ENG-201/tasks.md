# ENG-201: Add RBAC Permissions and Transfer Mutations/Queries — Master Task List

## Chunk 1: RBAC Foundation (Steps 1-3)
- [x] T-001: Record and communicate WorkOS permission registration requirements (`payment:manage`, `payment:view`, `payment:view_own`, `payment:retry`, `payment:cancel`, `payment:webhook_process`) and role mapping prerequisites
- [x] T-002: Add payment-scoped permission builders in `convex/fluent.ts` (`paymentQuery`, `paymentMutation`, `paymentAction`, `paymentRetryMutation`, `paymentCancelMutation`)
- [x] T-003: Migrate existing transfer entrypoints to payment builders in `convex/payments/transfers/mutations.ts` (`createTransferRequest`, `initiateTransfer`)

## Chunk 2: Transfer Mutations (Steps 4-6)
- [x] T-004: Implement `cancelTransfer` mutation in `convex/payments/transfers/mutations.ts` with state validation and `TRANSFER_CANCELLED` transition
- [x] T-005: Implement `retryTransfer` mutation in `convex/payments/transfers/mutations.ts` for failed transfers with fresh retry idempotency keys
- [x] T-006: Implement `confirmManualTransfer` mutation in `convex/payments/transfers/mutations.ts` for manual-provider transfers using `FUNDS_SETTLED`

## Chunk 3: Transfer Queries (Steps 7-8)
- [x] T-007: Migrate existing transfer queries in `convex/payments/transfers/queries.ts` to payment permission gating
- [x] T-008: Implement `listTransfersByCounterparty` and `listTransfersByDeal` in `convex/payments/transfers/queries.ts` using `by_counterparty` and `by_deal` indexes
- [x] T-009: Implement `getTransferTimeline` in `convex/payments/transfers/queries.ts` joining transfer record, GT audit journal (`auditJournal`), and cash-ledger journal (`cash_ledger_journal_entries`)

## Chunk 4: Tests and Gates (Step 9 + final verification)
- [x] T-010: Add/extend transfer mutation and query tests under `convex/payments/transfers/__tests__/` for cancel/retry/manual-confirm paths plus indexed query behavior
- [x] T-011: Run quality gate (`bun check`, `bun typecheck`, `bunx convex codegen`) and resolve any integration regressions
