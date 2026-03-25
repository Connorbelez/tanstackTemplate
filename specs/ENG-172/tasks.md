# ENG-172: REVERSAL Entry Type with Posting Group Semantics — Master Task List

## Chunk 1: Core Reversal Cascade Function
- [x] T-001: Add `assertReversalAmountValid()` helper to `integrations.ts`
- [x] T-002: Add `postPaymentReversalCascade()` to `integrations.ts` — the multi-leg reversal orchestrator
- [x] T-003: Add `postTransferReversal()` to `integrations.ts` — single-entry transfer reversal for webhook handlers

## Chunk 2: Reconciliation Detection Query
- [x] T-004: Add `findSettledObligationsWithNonZeroBalance()` to `reconciliation.ts`
- [x] T-005: Add `findSettledObligationsWithNonZeroBalanceInternal` internalQuery wrapper

## Chunk 3: Unit Tests — Reversal Cascade
- [x] T-006: Create `reversalCascade.test.ts` — full reversal cascade (CASH_RECEIVED + 2×LENDER_PAYABLE_CREATED + SERVICING_FEE)
- [x] T-007: Test cascade with clawback (payout already sent → Step 4 fires)
- [x] T-008: Test cascade without clawback (no payout → Step 4 skipped)
- [x] T-009: Test idempotency (calling cascade twice returns same entries)
- [x] T-010: Test amount validation (reversal amount > original → ConvexError)
- [x] T-011: Test causedBy linkage (every REVERSAL entry references its original)
- [x] T-012: Test posting group integrity (all entries share postingGroupId, CONTROL:ALLOCATION nets to zero)
- [x] T-013: Test `postTransferReversal()` single-entry reversal

## Chunk 4: Unit Tests — Reconciliation Detection
- [x] T-014: Create `reversalReconciliation.test.ts` — `findSettledObligationsWithNonZeroBalance` finds reversed obligations
- [x] T-015: Test that non-reversed settled obligations are NOT flagged
- [x] T-016: Test journal-derived balance after reversal via `getJournalSettledAmountForObligation`

## Chunk 5: Integration Test — End-to-End Reversal Flow
- [x] T-017: Create `reversalIntegration.test.ts` — full pipeline: accrue → receive cash → allocate → (optionally payout) → reverse
- [x] T-018: Verify all account balances after reversal
- [x] T-019: Verify posting group nets to zero via `getPostingGroupSummary`
- [x] T-020: Verify `findSettledObligationsWithNonZeroBalance` detects the reversal

## Chunk 6: Quality Gate & Codegen
- [x] T-021: Run `bun check` and fix any lint/format issues (2 non-null assertion fixes)
- [x] T-022: Run `bun typecheck` and fix any type errors (1 lenderId type fix)
- [x] T-023: Run `bunx convex codegen` — no schema changes needed
- [x] T-024: Run existing cash ledger test suite — 8 pre-existing failures, zero new regressions
