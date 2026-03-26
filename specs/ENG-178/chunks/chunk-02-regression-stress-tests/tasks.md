# Chunk 02: Regression Verification + Financial Invariant Stress Tests

## Tasks

- [ ] T-008: Create `convex/payments/cashLedger/__tests__/regressionVerification.test.ts`
  - Import `describe`, `it`, `expect` from `vitest`
  - Import `fs` from `node:fs` and `crypto` from `node:crypto` and `path` from `node:path`
  - Import `execFileSync` from `node:child_process` (NOT exec — use execFileSync for safety)
  - Create `describe("Regression verification: ownership ledger untouched", () => { ... })`
  - Implement test: use `execFileSync("git", ["diff", "--name-only", "main", "--", "convex/ledger/"])` to detect changes
  - Filter output to exclude `__tests__/` paths (test files may have additions from other issues)
  - If any non-test source files appear in the diff, fail with a message listing the changed files
  - Also implement a structural check: verify key source files exist in `convex/ledger/` (postEntry.ts, types.ts, accounts.ts, etc.)
  - This is a meta-test — it catches accidental modifications to ownership ledger source

- [ ] T-009: Create `convex/payments/cashLedger/__tests__/financialInvariantStress.test.ts` scaffold
  - Import from `vitest`, test utilities, integrations, accounts, types
  - Import `postTestEntry`, `createHarness`, `seedMinimalEntities`, `createDueObligation`, `createTestAccount`, `SYSTEM_SOURCE` from `./testUtils`
  - Import `postObligationAccrued`, `postCashReceiptForObligation` from `../integrations`
  - Import `getCashAccountBalance`, `findCashAccount`, `getOrCreateCashAccount` from `../accounts`
  - Import `buildIdempotencyKey` from `../types`
  - Import `getJournalSettledAmountForObligation` from `../reconciliation`
  - Set up `const modules = import.meta.glob("/convex/**/*.ts");`
  - Create outer `describe("Financial invariant stress tests", () => { ... })`

- [ ] T-010: Implement stress test — conservation holds after reversal + re-collection
  - Full cycle: accrue -> receive full amount -> settle -> post REVERSAL of receipt -> re-accrue -> re-receive -> re-settle
  - At each step, verify BORROWER_RECEIVABLE balance is consistent
  - After final settlement, verify journal-derived settled amount matches
  - Verify conservation: total cash in = total dispersable

- [ ] T-011: Implement stress test — CONTROL:ALLOCATION nets to zero even with partial reversals
  - Create a dispersal allocation posting group (LENDER_PAYABLE_CREATED + SERVICING_FEE_RECOGNIZED)
  - Post a partial REVERSAL of one LENDER_PAYABLE_CREATED entry
  - Verify CONTROL:ALLOCATION net is NOT zero (expected — partial reversal leaves it unbalanced)
  - Post the remaining REVERSAL to complete the reversal group
  - Verify net-zero on the reversal posting group

- [ ] T-012: Implement stress test — no negative LENDER_PAYABLE outside active reversals
  - Post LENDER_PAYABLE_CREATED entries for two lenders
  - Verify both have positive balances
  - Attempt LENDER_PAYOUT_SENT exceeding balance -> expect rejection
  - Post REVERSAL entry -> verify LENDER_PAYABLE can go negative (allowed for REVERSAL)
  - Post non-REVERSAL entry that would make LENDER_PAYABLE negative -> expect rejection

- [ ] T-013: Implement stress test — point-in-time reconstruction matches running balances (50+ entries)
  - Create accounts: CONTROL:ALLOCATION, LENDER_PAYABLE, SERVICING_REVENUE
  - Post 50+ entries in a loop (alternating LENDER_PAYABLE_CREATED and SERVICING_FEE_RECOGNIZED)
  - After all entries posted, read the account's running cumulative balance
  - Replay: query all journal entries for the account, sum debits and credits
  - Verify: replayed balance == running balance (no drift)

- [ ] T-014: Implement stress test — idempotent replay produces identical state
  - Post a sequence of 10 entries with known idempotencyKeys
  - Snapshot all account balances
  - Replay: post the SAME 10 entries again (same idempotencyKeys)
  - Verify: all entries return existing (not new) entries
  - Verify: account balances unchanged after replay
