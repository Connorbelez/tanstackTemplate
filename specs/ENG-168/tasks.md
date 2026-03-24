# ENG-168: Admin Correction Workflow — Master Task List

## Chunk 1: Backend (Validator + Mutation + Integration Helper)

- [ ] T-001: Add `postCashCorrectionArgsValidator` to `convex/payments/cashLedger/validators.ts`
- [ ] T-002: Add `postCashCorrection` internalMutation to `convex/payments/cashLedger/mutations.ts`
- [ ] T-003: Add `postCashCorrectionForEntry` integration helper to `convex/payments/cashLedger/integrations.ts`
- [ ] T-004: Run `bunx convex codegen`, `bun check`, `bun typecheck` — fix any issues

## Chunk 2: Tests

- [ ] T-005: Create `convex/payments/cashLedger/__tests__/corrections.test.ts` with comprehensive test suite
- [ ] T-006: Test — simple reversal (post entry, correct it, verify original unchanged, net balance = 0)
- [ ] T-007: Test — correction with replacement (reverse + new entry, verify causedBy linkage, net balance = replacement amount)
- [ ] T-008: Test — idempotency (calling correction twice returns same result)
- [ ] T-009: Test — non-admin rejection (CORRECTION with non-admin source is rejected by pipeline)
- [ ] T-010: Test — missing reason rejection
- [ ] T-011: Test — replacement exceeds original amount rejection
- [ ] T-012: Test — original entry immutability after correction
- [ ] T-013: Test — correction chain auditability (load correction chain via causedBy traversal)
- [ ] T-014: Test — postCashCorrectionForEntry integration helper
- [ ] T-015: Run `bun run test` — all tests pass
