# Chunk 03: Tests and Verification

- [x] T-009: Add `convex/dispersal/__tests__/calculateProRataShares.test.ts` covering exact-sum, equal-split odd-cent, and largest-remainder edge cases.
- [x] T-010: Add `convex/dispersal/__tests__/createDispersalEntries.test.ts` covering happy path, reroute application, idempotency, no-position, and fee-exceeds-settlement failures.
- [x] T-011: Add `convex/dispersal/__tests__/reconciliation.test.ts` covering undisbursed balance, history filtering, per-mortgage and per-obligation views, and servicing fee history.
- [ ] T-012: Run `bun check`, `bun typecheck`, and `bunx convex codegen`, then resolve any integration drift introduced by the new modules.
- [ ] T-013: Run `coderabbit review --plain` after the full spec implementation and address any high-signal issues if the tool is available in this environment.
