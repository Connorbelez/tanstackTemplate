# ENG-172: REVERSAL Entry Type with Posting Group Semantics

## Master Task List

### Chunk 1: Core Cascade Function (integrations.ts) ✅
- [x] T-001: Add `assertReversalAmountValid()` helper to `integrations.ts`
- [x] T-002: Add `postPaymentReversalCascade()` to `integrations.ts` — the multi-leg reversal orchestrator
- [x] T-003: Add `postTransferReversal()` to `integrations.ts` — single-entry transfer reversal for webhook handlers
- [x] T-004: Verify REVERSAL family constraints in `types.ts` and add documentation comment for balance check exemption

### Chunk 2: Reconciliation Query (reconciliation.ts + queries.ts) ✅
- [x] T-005: Add `findSettledObligationsWithNonZeroBalance()` to `reconciliation.ts`
- [x] T-006: Add `internalQuery` wrapper for `findSettledObligationsWithNonZeroBalance` in queries
- [x] T-007: Add public query endpoint `getSettledObligationsWithNonZeroBalance` to `queries.ts`

### Chunk 3: Unit Tests (reversalCascade.test.ts) ✅
- [x] T-008: Test full reversal cascade — CASH_RECEIVED + 2×LENDER_PAYABLE_CREATED + SERVICING_FEE → all reversed with correct accounts
- [x] T-009: Test cascade with clawback — payout already sent → Step 4 fires
- [x] T-010: Test cascade without clawback — no payout sent → Step 4 skipped
- [x] T-011: Test idempotency — calling cascade twice returns same entries
- [x] T-012: Test amount validation — reversal amount > original → ConvexError
- [x] T-013: Test causedBy linkage — every REVERSAL entry references its original
- [x] T-014: Test posting group integrity — all entries share `postingGroupId`
- [x] T-015: Test `postTransferReversal()` — single-entry reversal with correct idempotency

### Chunk 4: Integration Tests (reversalIntegration.test.ts) ✅
- [x] T-016: E2E test: accrue → receive cash → allocate → reverse → verify all account balances
- [x] T-017: E2E test: accrue → receive → allocate → payout → reverse → verify clawback
- [x] T-018: Test `findSettledObligationsWithNonZeroBalance()` detects reversed obligations
- [x] T-019: Test posting group nets to zero via `validatePostingGroupEntries` after reversal
- [x] T-020: Run quality gate: `bun check`, `bun typecheck`, `bunx convex codegen`
