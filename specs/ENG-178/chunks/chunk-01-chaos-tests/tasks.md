# Chunk 01: Chaos Tests

## Tasks

- [ ] T-001: Create `convex/payments/cashLedger/__tests__/chaosTests.test.ts` scaffold
  - Import from `vitest` (describe, expect, it)
  - Import test utilities: `createHarness`, `seedMinimalEntities`, `createDueObligation`, `SYSTEM_SOURCE`, `createTestAccount`, `postTestEntry` from `./testUtils`
  - Import e2e helpers: `assertAccountIntegrity`, `assertObligationConservation`, `assertSettlementReconciles` from `./e2eHelpers`
  - Import integrations: `postObligationAccrued`, `postCashReceiptForObligation`, `postSettlementAllocation` from `../integrations`
  - Import reconciliation: `reconcileObligationSettlementProjectionInternal` from `../reconciliation`
  - Import posting groups: `getPostingGroupSummary` from `../postingGroups`
  - Import accounts: `findCashAccount`, `getCashAccountBalance`, `getOrCreateCashAccount` from `../accounts`
  - Import types: `buildIdempotencyKey` from `../types`
  - Import dispersal: `createDispersalEntries` from `../../../dispersal/createDispersalEntries`
  - Set up `const modules = import.meta.glob("/convex/**/*.ts");`
  - Create outer `describe("Chaos tests (Tech Design §11.5)", () => { ... })`
  - Each test gets its own `createHarness(modules)` call (full isolation per test)

- [ ] T-002: Implement Test 1 — Webhook delivered out of order (settlement before initiation)
  - Seed entities via `seedMinimalEntities(t)` + `createDueObligation(t, { ... })`
  - Post `OBLIGATION_ACCRUED` via `postObligationAccrued(ctx, { obligationId, source: SYSTEM_SOURCE })`
  - Post `CASH_RECEIVED` directly without going through a collection attempt "initiated" state
    - Use `postCashReceiptForObligation(ctx, { obligationId, amount, idempotencyKey, source })`
  - This simulates settlement arriving before the initiation webhook is processed
  - Verify: the cash receipt succeeded (entry returned, not null)
  - Verify: BORROWER_RECEIVABLE balance = accrued - received
  - Verify: TRUST_CASH balance = received amount
  - Assert account integrity via `assertAccountIntegrity(t, { mortgageId })`

- [ ] T-003: Implement Test 2a — Duplicate cash receipt webhook is idempotent
  - Seed + accrue an obligation
  - Post CASH_RECEIVED with `idempotencyKey: "chaos-dup-receipt"`
  - Post SAME CASH_RECEIVED with same `idempotencyKey: "chaos-dup-receipt"`
  - Verify: second call returns the SAME entry (identical `_id`)
  - Verify: only ONE `CASH_RECEIVED` journal entry exists for this obligation
  - Verify: BORROWER_RECEIVABLE balance reflects a single payment, not double

- [ ] T-004: Implement Test 2b — Duplicate REVERSAL entry is idempotent
  - Seed + accrue + post cash receipt
  - Post a REVERSAL entry with `idempotencyKey: "chaos-dup-reversal"` and `causedBy` pointing to the receipt
  - Post SAME REVERSAL with same idempotencyKey
  - Verify: second call returns existing entry (same `_id`)
  - Verify: only ONE reversal entry exists
  - Verify: BORROWER_RECEIVABLE balance reflects single reversal

- [ ] T-005: Implement Test 3 — Settlement callback fires after cancellation
  - Seed + accrue obligation + post cash receipt (full amount)
  - Patch obligation to `status: "settled"`, `amountSettled: amount`
  - Then patch obligation to `status: "cancelled"` (simulate cancellation after settlement)
  - Attempt another CASH_RECEIVED for this obligation
  - The cash receipt should still succeed at the ledger level (the cash ledger doesn't enforce obligation status — it's the GT engine that rejects transitions on final states)
  - BUT: verify that reconciliation detects the drift between `amountSettled` and journal
  - Run `reconcileObligationSettlementProjectionInternal(ctx, obligationId)` and verify `hasDrift: true`

- [ ] T-006: Implement Test 4 — Concurrent settlement of same obligation
  - Seed + accrue obligation for 100,000
  - Post first CASH_RECEIVED for 100,000 (idempotencyKey: "concurrent-1")
  - Post second CASH_RECEIVED for 100,000 (idempotencyKey: "concurrent-2")
  - Patch obligation: `status: "settled"`, `amountSettled: 100_000`
  - Verify: TWO CASH_RECEIVED entries exist (different idempotency keys)
  - Verify: BORROWER_RECEIVABLE balance = accrued (100k debit) - 2x received (200k credits) = -100k
  - Verify: journal-derived settled amount = 200,000 (overpayment)
  - Run reconciliation: `hasDrift: true` since `amountSettled` (100k) ≠ journal (200k)
  - Verify: TRUST_CASH has debit balance of 200,000

- [ ] T-007: Implement Test 5 — Dispersal mutation failure after settlement (reconciliation detects gap)
  - Seed + accrue + receive full payment + settle obligation
  - Do NOT create dispersal entries (simulating dispersal mutation failure)
  - Use `reconcileObligationSettlementProjectionInternal(ctx, obligationId)` to verify journal state
  - Query `dispersalEntries` by obligationId — verify empty
  - This confirms the reconciliation layer can detect the gap (the actual self-healing cron would re-trigger dispersal, but we just verify detection)
