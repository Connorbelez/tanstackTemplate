# Chunk 03: Quality Gate & Verification

## Tasks

- [ ] T-015: Run quality checks and fix errors
  - Run `bun check` — auto-fixes formatting, reports remaining lint errors
  - Run `bun typecheck` — TypeScript type checking
  - Run `bunx convex codegen` — regenerate Convex types
  - Fix any errors in the new test files (chaosTests.test.ts, regressionVerification.test.ts, financialInvariantStress.test.ts)
  - Do NOT modify any files outside the new test files

- [ ] T-016: Run full test suite and verify all pass
  - Run `bun run test`
  - ALL existing tests must pass unchanged
  - ALL new chaos + stress + regression tests must pass
  - If any test fails, diagnose and fix only the new test files
  - Never modify existing test files or production code

- [ ] T-017: Verify zero ownership ledger changes
  - Run `git diff main -- convex/ledger/`
  - Must show ZERO changes to `convex/ledger/` types or functions
  - If any changes detected, revert them immediately
  - This is the hard constraint from REQ-244
