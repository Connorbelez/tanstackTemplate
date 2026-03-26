# ENG-178: Chaos Tests & Regression Verification — Master Task List

## Chunk 1: Chaos Tests (chaosTests.test.ts) ✅
- [x] T-001: Create `chaosTests.test.ts` scaffold with imports, harness setup, and describe block
- [x] T-002: Implement Test 1 — Webhook delivered out of order (settlement before initiation)
- [x] T-003: Implement Test 2a — Duplicate cash receipt webhook is idempotent
- [x] T-004: Implement Test 2b — Duplicate REVERSAL entry is idempotent (same idempotencyKey)
- [x] T-005: Implement Test 3 — Settlement callback fires after cancellation (ignored by state)
- [x] T-006: Implement Test 4 — Concurrent settlement of same obligation (overpayment → UNAPPLIED_CASH)
- [x] T-007: Implement Test 5 — Dispersal mutation failure after settlement (reconciliation detects gap)

## Chunk 2: Regression Verification + Financial Invariant Stress Tests ✅
- [x] T-008: Create `regressionVerification.test.ts` — verify `convex/ledger/` source files unchanged via git diff
- [x] T-009: Create `financialInvariantStress.test.ts` scaffold with imports and describe blocks
- [x] T-010: Implement stress test — conservation holds after reversal + re-collection cycle
- [x] T-011: Implement stress test — CONTROL:ALLOCATION nets to zero even with partial reversals
- [x] T-012: Implement stress test — no negative LENDER_PAYABLE outside active reversals
- [x] T-013: Implement stress test — point-in-time reconstruction matches running balances (50+ entries)
- [x] T-014: Implement stress test — idempotent replay produces identical state

## Chunk 3: Quality Gate & Verification ✅
- [x] T-015: Run `bun check` + `bun typecheck` + `bunx convex codegen` — fix any errors
- [x] T-016: Run `bun run test` — all tests (existing + 13 new) pass with no failures
- [x] T-017: Verify `git diff main -- convex/ledger/` shows ZERO changes to ownership ledger
