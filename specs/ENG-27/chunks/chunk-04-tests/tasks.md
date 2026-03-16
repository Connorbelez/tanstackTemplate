# Chunk 04: Tests

## Tasks
- [ ] T-027: Update existing tests in `ledger.test.ts` — change `api.ledger.mutations.postEntry` calls to `internal.ledger.mutations.postEntryDirect`
- [ ] T-028: Create `convex/ledger/__tests__/postEntry.test.ts` — test harness setup + happy path tests for original 6 entry types (MORTGAGE_MINTED, SHARES_ISSUED, SHARES_TRANSFERRED, SHARES_REDEEMED, MORTGAGE_BURNED, CORRECTION)
- [ ] T-029: Add happy path tests for 3 reservation types (SHARES_RESERVED, SHARES_COMMITTED, SHARES_VOIDED) — verify cumulatives unchanged for audit-only types
- [ ] T-030: Add rejection tests — INVALID_AMOUNT, SAME_ACCOUNT, ACCOUNT_NOT_FOUND, TYPE_MISMATCH, INSUFFICIENT_BALANCE, MIN_FRACTION_VIOLATED, MORTGAGE_MISMATCH, CORRECTION_REQUIRES_*
- [ ] T-031: Add idempotency test — same key returns existing entry with zero side effects
- [ ] T-032: Add sequence number monotonicity test — entries get sequential numbers
- [ ] T-033: Add sell-all exception test — POSITION can go to exactly 0
- [ ] T-034: Add WORLD exemption test — WORLD can go negative
- [ ] T-035: Run full quality gate: `bunx convex codegen && bun check && bun typecheck && bun run test`
