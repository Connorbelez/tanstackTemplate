# Chunk 01: postCorrection Mutation + Tests

## Tasks

- [ ] T-001: Add `postCorrection` mutation to `convex/ledger/mutations.ts` using `adminMutation` chain
- [ ] T-002: Run `bunx convex codegen && bun check && bun typecheck` to verify compilation
- [ ] T-003: Create test file `convex/ledger/__tests__/postCorrection.test.ts` with test harness setup
- [ ] T-004: Implement T-PC-01 — happy path full correction reversal test
- [ ] T-005: Implement T-PC-02 — happy path partial correction test
- [ ] T-006: Implement T-PC-03 — reject causedBy referencing non-existent entry
- [ ] T-007: Implement T-PC-04 + T-PC-05 — reject empty and whitespace-only reason
- [ ] T-008: Implement T-PC-06 + T-PC-07 — reject non-admin source type and missing actor
- [ ] T-009: Implement T-PC-08 — original entry unchanged after correction
- [ ] T-010: Implement T-PC-09 — idempotency (duplicate key returns existing)
- [ ] T-011: Implement T-PC-10 + T-PC-11 — min position violation + correction to zero allowed
- [ ] T-012: Run full test suite and quality gate: `bunx convex codegen && bun check && bun typecheck && bun run test`
