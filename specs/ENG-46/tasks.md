# ENG-46: Extend Transition Engine for Compound State Support

## Master Task List

### Chunk 1: Types + Effect Registry Placeholders
- [x] T-001: Add DealEventType union and payload interfaces to `convex/engine/types.ts`
- [x] T-002: Add DealCommand discriminated union type to `convex/engine/types.ts`
- [x] T-003: Create `convex/engine/effects/dealClosingPlaceholder.ts` with single placeholder mutation
- [x] T-004: Register all 12 deal effect names in `convex/engine/effects/registry.ts` pointing to placeholder

### Chunk 2: Integration Tests
- [x] T-005: Create `convex/engine/__tests__/transition.integration.test.ts` with backward-compatibility tests (flat-state machines round-trip through serialize/deserialize)
- [x] T-006: Add compound state engine integration tests (deal machine full happy path via serialize→deserialize→resolveState→getNextSnapshot→serialize)
- [x] T-007: Add compound state audit journal field tests (dot-notation in previousState/newState)
- [x] T-008: Add rejection tests from compound states (wrong-phase events, terminal state lockdown)
- [x] T-009: Add DEAL_CANCELLED from compound states test (dot-notation previousState → flat "failed" newState)

### Chunk 3: Quality Gate + Verification
- [x] T-010: Run `bunx convex codegen` — manually updated `_generated/api.d.ts` (no deployment available)
- [x] T-011: Run `bun check` — lint + format passes
- [x] T-012: Run `bun typecheck` — zero errors in our files (pre-existing errors in ledger/prodLedger unrelated)
- [x] T-013: Run `bun run test` — 48 new tests pass + 141 existing tests pass (189 total)
