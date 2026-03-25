# Chunk 05: Existing Test Modifications + Final Verification

## Tasks
- [ ] T-022: Add to integration.test.ts — zero-amount rejection, negative-amount rejection, debit===credit rejection
- [ ] T-023: Add to constraintsAndBalanceExemption.test.ts — SUSPENSE_ESCALATED balance exemption test
- [ ] T-024: Run `bunx convex codegen`, `bun check`, `bun typecheck`, `bun run test` — all pass
- [ ] T-025: Verify no `any` types in test files, no floating-point arithmetic in assertions
