# Chunk 03: Integration Verification

- [x] T-010: Create `convex/accrual/__tests__/accrual.integration.test.ts` with convex-test coverage for real mortgage rows plus seeded ledger activity, validating single-lender, per-mortgage, portfolio, and daily snapshot queries.
- [x] T-011: Run focused accrual test suites and fix any implementation drift revealed by integration or auth failures.
- [x] T-012: Run the repo quality gate in the required order: `bun check`, `bun typecheck`, `bunx convex codegen`.
- [ ] T-013: Run `coderabbit review --plain` after the full ENG-67 implementation pass and address any material findings before closing the work.
