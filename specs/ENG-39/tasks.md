# ENG-39 — Implement history queries (`getAccountHistory`, `getMortgageHistory`)

## Master Task List

### Chunk 1: History Queries Hardening & Verification
- [x] T-001: Update `convex/ledger/queries.ts` so `getAccountHistory` enforces a default `limit=100` when omitted, while preserving `from`/`to` filtering, debit+credit merge behavior, deduplication, and ascending `sequenceNumber` ordering.
- [x] T-002: Update `convex/ledger/queries.ts` so `getMortgageHistory` enforces a default `limit=100` when omitted, while preserving `from`/`to` filtering, the `by_mortgage_and_time` index scan, and ascending `sequenceNumber` ordering.
- [x] T-003: Align and extend `convex/ledger/__tests__/ledger.test.ts` with the current repo state: keep the existing ordering, time-range, and explicit-limit coverage, and add focused assertions for the new default-limit behavior and any remaining acceptance-criteria gaps.
- [ ] T-004: Run `bun check`, `bunx convex codegen`, `bun typecheck`, and the relevant ledger test suite(s); resolve any fallout before closing the issue.
