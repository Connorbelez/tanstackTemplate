# Tasks: ENG-196 — Wire ManualPaymentMethod for Bidirectional Transfers

Source: Linear ENG-196, Notion implementation plan, linked Unified Payment Rails docs
Generated: 2026-03-27

## Phase 1: Manual Provider Flow
- [x] T-001: Update [`convex/payments/transfers/providers/manual.ts`](../../convex/payments/transfers/providers/manual.ts) so manual inbound initiation still returns `confirmed`, but manual outbound initiation returns `pending` while preserving manual provider refs and the existing `TransferProvider` contract.
- [x] T-002: Tighten the outbound manual confirmation path in [`convex/payments/transfers/mutations.ts`](../../convex/payments/transfers/mutations.ts) so admin confirmation clearly settles the outbound manual transfer after initiation, reusing existing transition-engine and source-attribution patterns instead of bypassing domain controls.

## Phase 2: Integration Verification
- [x] T-003: Add or update transfer-domain tests covering inbound manual immediate confirmation and outbound manual initiate-then-confirm behavior in [`convex/payments/transfers/__tests__/mutations.test.ts`](../../convex/payments/transfers/__tests__/mutations.test.ts) and/or [`convex/payments/transfers/__tests__/handlers.integration.test.ts`](../../convex/payments/transfers/__tests__/handlers.integration.test.ts).
- [x] T-004: Add integration assertions that confirmed inbound manual transfers still reach `CASH_RECEIVED` semantics and confirmed outbound manual transfers still reach `LENDER_PAYOUT_SENT` semantics through the existing transfer effect and cash-ledger bridge path.
- [x] T-005: Run the required repo gates for this unit of work: `bun check`, `bun typecheck`, and `bunx convex codegen`, then capture any follow-up fixes required for ENG-196.
