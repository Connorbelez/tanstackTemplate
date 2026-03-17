# Chunk 03: Tests

- [ ] T-019: Update existing tests in `ledger.test.ts` — replace `api.ledger.mutations.postEntry` with `internal.ledger.mutations.postEntryDirect`
- [ ] T-020: Create `postEntry.test.ts` with harness + happy path tests for 6 original entry types
- [ ] T-021: Add happy path tests for 3 reservation types (verify AUDIT_ONLY cumulatives unchanged)
- [ ] T-022: Add rejection tests — all ConvexError codes
- [ ] T-023: Add idempotency, sequence monotonicity, sell-all, WORLD exemption tests
- [ ] T-024: Run `bunx convex codegen && bun check && bun typecheck && bun run test`
