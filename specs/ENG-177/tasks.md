# ENG-177: E2E Integration Tests — Full Accrual → Payout Flow

## Master Task List

### Chunk 1: Test Helpers & Infrastructure
- [x] T-001: Create `e2eHelpers.ts` with `assertObligationConservation()`
- [x] T-002: Add `assertPostingGroupComplete()` to e2eHelpers
- [x] T-003: Add `assertAccountIntegrity()` to e2eHelpers
- [x] T-004: Add `assertSettlementReconciles()` to e2eHelpers
- [x] T-005: Add `assertFullConservation()` orchestrator to e2eHelpers
- [x] T-006: Add `createDueObligation()` helper to testUtils.ts

### Chunk 2: E2E Scenarios 1–3 (Happy Path, Partial Settlement, Multi-Lender)
- [x] T-007: Create `e2eLifecycle.test.ts` with test scaffolding and shared setup
- [x] T-008: Implement Scenario 1 — Happy path (accrue → receive → allocate → payout)
- [x] T-009: Implement Scenario 2 — Partial settlement (two payments)
- [x] T-010: Implement Scenario 3 — Multi-lender split (60/40)

### Chunk 3: E2E Scenarios 4–8 (Reversal, Correction, Waiver, Write-Off)
- [x] T-011: Implement Scenario 4 — Reversal (it.skip, depends on ENG-172)
- [x] T-012: Implement Scenario 5 — Reversal after payout / clawback (it.skip, depends on ENG-172)
- [x] T-013: Implement Scenario 6 — Admin correction
- [x] T-014: Implement Scenario 7 — Partial waiver
- [x] T-015: Implement Scenario 8 — Full write-off

### Chunk 4: Financial Conservation Test Suite
- [x] T-016: Conservation test: settled = dispersals + servicing fee per obligation
- [x] T-017: Conservation test: CONTROL:ALLOCATION nets to zero per posting group
- [x] T-018: Conservation test: no negative LENDER_PAYABLE outside active reversals
- [x] T-019: Conservation test: point-in-time reconstruction matches running balances
- [x] T-020: Conservation test: idempotent replay produces same state
- [x] T-021: Run quality gate (bun check, bun typecheck, bunx convex codegen)
