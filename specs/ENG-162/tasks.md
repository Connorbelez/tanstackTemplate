# ENG-162: Lender Payout Posting with Non-Negative Enforcement

## Tasks

- [x] T-001: Enrich `assertNonNegativeBalance` error message with attempted amount, current balance, and projected balance
- [x] T-002: Add optional `postingGroupId` arg to `postLenderPayout` mutation, pass through to `postCashEntryInternal`
- [x] T-003: Create dedicated test file `lenderPayoutPosting.test.ts` with all 5 acceptance criteria + DR-3 + DR-4 + DR-5
- [x] T-004: Run full test suite and quality gates (`bun check`, `bun typecheck`, `bunx convex codegen`)
