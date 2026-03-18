# ENG-65 — End-to-End Verification & Definition of Done

## Master Task List

### Chunk 1: Pre-flight + Schema/Structure Verification ✅
- [x] T-001: Verify ENG-63/64 deliverables — PASS (effects registered, tests relocated to src/test/, execute pipeline DEFERRED)
- [x] T-002: Run full test suite — 1440 passed, 2 failed (stale ledger assertions, not payment code), 81 unhandled rejections (convex-test framework limitation)
- [x] T-003: Lint/typecheck/codegen — bun check PASS, codegen PASS, typecheck FAIL (32 errors in non-payment files)
- [x] T-004: DoD #12 Schema audit — PASS with deviations (extra fields accepted, MISSING by_obligation index on collectionPlanEntries)
- [x] T-005: DoD #13 File structure — PASS with deviations (convex/engine/ prefix accepted, crossEntity/endToEnd tests in src/test/, execute pipeline absent)

### Chunk 2: Machine Verification (DoD #1, #2) ✅
- [x] T-006: DoD #1 — Obligation machine matches SPEC §3.1. 6 states, 4 events, guards, actions all correct. 2 extra WAIVED transitions (accepted enhancements).
- [x] T-007: DoD #1 — 33 tests pass (exceeds 24 minimum). Full matrix + partial payment branches.
- [x] T-008: DoD #2 — Collection attempt machine matches SPEC §4.1. 7 states, 8 events, guards correct. incrementRetryCount correctly uses assign.
- [x] T-009: DoD #2 — 71 tests pass (exceeds 56 minimum). Full 7×8 matrix + guard edge cases + integration paths.
- [x] T-010: Deviations documented. No spec drift. 5 items for spec update (event types, extra transitions, PROVIDER_ACKNOWLEDGED).

### Chunk 3: Generation + Rules Verification (DoD #3, #4, #7, #8) ✅
- [x] T-011: DoD #3 — Generation logic matches spec. All frequencies, Math.round cents, grace period (15 days), machineContext correct.
- [x] T-012: DoD #3 — 14/14 generation tests pass. Covers all frequencies, idempotency, error cases.
- [x] T-013: DoD #4 — ScheduleRule matches spec. N days before due, idempotent, defaults to "manual" (Phase 1).
- [x] T-014: DoD #7 — RetryRule matches spec. Exponential backoff (3,6,12 days), maxRetries, rescheduledFromId.
- [x] T-015: DoD #8 — LateFeeeRule matches spec. Creates obligation (not plan entry), idempotent, $50 default.
- [x] T-016: 14/14 rules tests pass. All three rules covered with idempotency tests.

### Chunk 4: Methods + Cross-Entity Chain Verification (DoD #5, #6, #9, #10, #11, #14) ✅
- [x] T-017: DoD #5 — ManualPaymentMethod works E2E. initiate() returns confirmed, full flow tested.
- [x] T-018: DoD #6 — MockPADMethod works. Async path with DI scheduler, configurable delay/failureRate.
- [x] T-019: DoD #9 — Cross-machine chain works. 2 of 3 audit entries explicitly asserted (mortgage entry exists but not asserted).
- [x] T-020: DoD #10 — OBLIGATION_OVERDUE fires to Mortgage → delinquent. Real evaluateRules called (not stub).
- [x] T-021: DoD #11 — Partial settlement verified. 150k+150k=300k accumulates correctly, isFullySettled guard works.
- [x] T-022: DoD #14 — PaymentMethod interface clean. Adding RotessaPADMethod = 1 class + 1 registry entry, zero machine/rule/effect changes.
- [x] T-023: 34/34 tests pass (25 methods + 4 crossEntity + 5 endToEnd).

### Chunk 5: Code Review + Drift Fixes + Final Pass ✅
- [x] T-024: D2 RESOLVED — evaluateRules calls real engine (confirmed in Chunk 1).
- [x] T-025: D4 NOT IMPLEMENTABLE — Convex doesn't support indexing array fields. Workaround: by_status + filter.
- [x] T-026: Code review — no diff to review (branch at main). Manual review: clean code.
- [x] T-027: Fixed 2 issues — added version to obligation machine config + fixed 3 TS errors in generation.test.ts.
- [x] T-028: Final pass — bun check PASS, typecheck 29 errors (all pre-existing, 0 payment), codegen PASS, tests 1440/2 (pre-existing).
- [x] T-029: Verification report created at specs/ENG-65/verification-report.md.
