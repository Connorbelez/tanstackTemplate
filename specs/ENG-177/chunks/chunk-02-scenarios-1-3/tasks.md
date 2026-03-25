# Chunk 2: E2E Scenarios 1–3

- [ ] T-007: Create `convex/payments/cashLedger/__tests__/e2eLifecycle.test.ts` with test scaffolding — imports, harness creation, shared `seedMinimalEntities` + `createDueObligation` in beforeEach
- [ ] T-008: Implement Scenario 1 — Happy path: single obligation → accrue → receive full amount → settlement allocation → lender payouts → assertFullConservation
- [ ] T-009: Implement Scenario 2 — Partial settlement: create 100,000 cent obligation → post two CASH_RECEIVED (60,000 + 40,000) → dispersal after full settlement → conservation check
- [ ] T-010: Implement Scenario 3 — Multi-lender split: use 60/40 ownership from seedMinimalEntities → verify lender A gets 60% and lender B gets 40% of payables and payouts
