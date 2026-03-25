# ENG-52 — Deal Closing Integration Tests

## Master Task List

### Chunk 1: Scaffold + Happy Path + Cancellation
- [x] T-001: Create test file scaffold with imports, module glob, identity fixtures, source fixtures
- [x] T-002: Implement seedDeal helper (users, properties, brokers, mortgages, deals)
- [x] T-003: Implement happy path individual transition tests (each step verified)
- [x] T-004: Implement full happy path end-to-end test with effects verification
- [x] T-005: Implement audit journal causal chain test (newState[N] === previousState[N+1])
- [x] T-006: Implement cancellation tests from each phase (initiated, lawyerOnboarding, documentReview, fundsTransfer)

### Chunk 2: Rejection + Concurrency + Quality Gates
- [x] T-007: Implement rejection tests (out-of-phase events rejected, state unchanged, rejection journaled)
- [x] T-008: Implement terminal state rejection tests (confirmed and failed accept no events)
- [x] T-009: Implement concurrency simulation test (sequential OCC: first succeeds, second rejected, both journaled)
- [x] T-010: Run quality gates (bun check, bun typecheck, bunx convex codegen)
- [x] T-011: Run test suite, fix failures, verify all tests pass
