# ENG-184: Phase 1 Transfer Domain Foundation — Master Task List

## Chunk 1: Schema & Types (Steps 1-2)
- [x] T-001: Create `convex/payments/transfers/types.ts` — transfer direction, type taxonomy, counterparty types, source types
- [x] T-002: Create `convex/payments/transfers/validators.ts` — Convex validators mirroring transfer types
- [x] T-003: Evolve `transferRequests` table in `convex/schema.ts` — add `initiated` status, GT fields, all spec fields, new indexes

## Chunk 2: State Machine & Registration (Steps 3-4)
- [x] T-004: Create `convex/engine/machines/transfer.machine.ts` — XState v5 pure functional transfer lifecycle machine
- [x] T-005: Add `"transfer"` to `EntityType` and `GovernedEntityType` in `convex/engine/types.ts`
- [x] T-006: Add `transfer: "transferRequests"` to `ENTITY_TABLE_MAP` in `convex/engine/types.ts`
- [x] T-007: Add `v.literal("transfer")` to `entityTypeValidator` in `convex/engine/validators.ts`
- [x] T-008: Import and register `transferMachine` in `convex/engine/machines/registry.ts`

## Chunk 3: Provider Interface & Manual Provider (Step 5)
- [x] T-009: Create `convex/payments/transfers/interface.ts` — `TransferProvider` strategy interface + `TransferRequestInput`
- [x] T-010: Create `convex/payments/transfers/providers/manual.ts` — `ManualTransferProvider` with bidirectional support + immediate confirmation
- [x] T-011: Create `convex/payments/transfers/providers/registry.ts` — provider resolution by code with DI factory
- [x] T-012: Create `convex/payments/transfers/providers/adapter.ts` — `PaymentMethodAdapter` wrapping existing `PaymentMethod` in `TransferProvider`

## Chunk 4: Effects & Ledger Bridge (Step 6)
- [x] T-013: Create `convex/engine/effects/transfer.ts` — four transfer effects (recordTransferProviderRef, publishTransferConfirmed, publishTransferFailed, publishTransferReversed)
- [x] T-014: Register transfer effects in `convex/engine/effects/registry.ts`
- [x] T-015: Add `postCashReceiptForTransfer()` in `convex/payments/cashLedger/integrations.ts`
- [x] T-016: Add `postLenderPayoutForTransfer()` in `convex/payments/cashLedger/integrations.ts`

## Chunk 5: Mutations, Queries & Bridge (Steps 7-8)
- [x] T-017: Create `convex/payments/transfers/mutations.ts` — `createTransferRequest` + `initiateTransfer` admin mutations
- [x] T-018: Create `convex/payments/transfers/queries.ts` — `getTransferRequest`, `listTransfersByMortgage`, `listTransfersByStatus` with RBAC
- [x] T-019: Modify `convex/engine/effects/collectionAttempt.ts` — bridge `emitPaymentReceived` to create parallel transfer record

## Chunk 6: Webhook & Reconciliation (Steps 9-10)
- [x] T-020: Create `convex/payments/webhooks/vopay.ts` — skeleton webhook handler following Rotessa/Stripe pattern
- [x] T-021: Add VoPay signature verification in `convex/payments/webhooks/verification.ts`
- [x] T-022: Add `/webhooks/pad_vopay` route in `convex/http.ts`
- [x] T-023: Create `convex/payments/transfers/reconciliation.ts` — orphaned confirmed transfer detection + self-healing
- [x] T-024: Wire reconciliation cron in `convex/crons.ts` (verify existing cron reference)

## Chunk 7: Tests & Verification (Steps 11-12)
- [x] T-025: Create `convex/engine/machines/__tests__/transfer.machine.test.ts` — full transition coverage
- [x] T-026: Create `convex/payments/transfers/__tests__/mutations.test.ts` — create transfer, idempotency, validation
- [x] T-027: Create `convex/payments/transfers/__tests__/bridge.test.ts` — collection attempt bridge
- [x] T-028: Create `convex/payments/transfers/__tests__/reconciliation.test.ts` — orphan detection, healing, escalation
- [x] T-029: Verify existing collection attempt tests pass (zero regression)
- [x] T-030: Run `bunx convex codegen`, `bun check`, `bun typecheck` — final quality gate
