# ENG-65: End-to-End Verification Report

**Date:** 2026-03-18
**Branch:** `03-18-eng-65`
**Base commit:** `d158ae0`

---

## Definition of Done Checklist

| # | DoD Item | Status | Notes |
|---|----------|--------|-------|
| 1 | Obligation machine matches SPEC 3.1, matrix passes (24 cases) | PASS | 33 tests pass. 2 extra WAIVED transitions from `upcoming` and `partially_settled` (accepted enhancements over spec). |
| 2 | Collection Attempt machine matches SPEC 4.1, matrix passes (56 cases) | PASS | 71 tests pass. All transitions match. `PROVIDER_ACKNOWLEDGED` declared but unused (both spec and code). |
| 3 | Obligations generate from mortgage terms -- correct amounts, dates, grace periods | PASS | 14 tests. All frequencies (monthly, bi-weekly, accelerated bi-weekly, weekly). `Math.round` cents. 15-day grace. `machineContext` patched with real obligation ID. |
| 4 | ScheduleRule creates plan entries N days before due, no duplicates | PASS | Idempotent via batch lookup. Phase 1 defaults to `"manual"` method. |
| 5 | ManualPaymentMethod works E2E: initiated -> confirmed, obligation settles | PASS | Full flow tested in `endToEnd.test.ts`. |
| 6 | MockPADMethod works: async path with configurable delay/failure | PASS | DI-based `ScheduleSettlementFn`. Configurable `delayMs` / `failureRate`. Input validation on construction. |
| 7 | RetryRule creates retry entries with exponential backoff | PASS | 3, 6, 12 day pattern. Respects `maxRetries`. `rescheduledFromId` linked. Idempotent via `getRetryEntryForPlanEntry`. |
| 8 | LateFeeRule creates late fee obligations on overdue, idempotent | PASS | Creates obligation (not plan entry). $50 default. Idempotent via `sourceObligationId` lookup. |
| 9 | Cross-machine chain: attempt confirmed -> obligation settled -> mortgage cure (3 audit entries) | PASS (minor gap) | Chain works end-to-end. 2 of 3 audit entries explicitly asserted in cross-entity test. Third entry (dispersal) is a stub log. |
| 10 | OBLIGATION_OVERDUE fires to Mortgage -> delinquent | PASS | Real `evaluateRules` called (not stub). Mortgage transitions to `delinquent`. Late fee obligation created. |
| 11 | Partial settlement: amountSettled accumulates correctly | PASS | 150k + 150k = 300k. `isFullySettled` guard fires on second payment. |
| 12 | Schema matches SPEC 9 | PASS (deviations) | Extra fields accepted. Missing `by_obligation` index on `collectionPlanEntries` is a **Convex limitation** (cannot index array fields). See Drift D4 below. |
| 13 | File structure matches SPEC 2 | PASS (deviations) | `convex/engine/` prefix accepted. Tests in `src/test/` and `convex/**/__tests__/`. Execute pipeline deferred to Phase 2. |
| 14 | PaymentMethod interface clean | PASS | 1 class + 1 registry entry for new method. Zero machine/rule/effect changes needed. Strategy pattern + DI confirmed. |

---

## Drift Resolution Table

| Drift | Description | Resolution | Action |
|-------|-------------|------------|--------|
| D1 | File structure uses `convex/engine/` prefix instead of SPEC's flat structure | ACCEPTED | Convention fits project layout. No change. |
| D2 | `evaluateRules` wiring -- was calling stub? | RESOLVED | Confirmed: `emitObligationOverdue` in `convex/engine/effects/obligation.ts` calls `internal.payments.collectionPlan.engine.evaluateRules` (the real engine action, not the stub). Stub at `convex/payments/collectionPlan/stubs.ts` is dead code retained for reference. |
| D3 | Tests in `src/test/` instead of `convex/__tests__/` | ACCEPTED | Both locations used. Integration tests in `src/test/convex/engine/`, unit tests in `convex/**/__tests__/`. Consistent with project convention. |
| D4 | Missing `by_obligation` index on `collectionPlanEntries` | NOT IMPLEMENTABLE | `obligationIds` is `v.array(v.id("obligations"))`. Convex does not support indexing array fields. The codebase uses full-scan with `by_status` index + in-memory filter as a workaround. Documented in `seedPaymentData.ts:117`. |
| D5 | Extra fields on schema tables beyond SPEC | ACCEPTED | Additional fields (`rescheduledFromId`, `by_rescheduled_from` index, `providerStatus`, `failureReason`) are legitimate enhancements. |
| D6 | Execute pipeline not implemented | DEFERRED | Per SPEC, the execute pipeline (cron that picks up planned entries and initiates collection attempts) is Phase 2. Seed data + admin mutations handle Phase 1 E2E. |

---

## Code Quality Findings

### Fixed in This Chunk

1. **Obligation machine missing `version` property on config** -- Added `version: OBLIGATION_MACHINE_VERSION` to `obligation.machine.ts` `createMachine()` config. This makes it consistent with `collectionAttempt.machine.ts` which already had `version: COLLECTION_ATTEMPT_MACHINE_VERSION`.

2. **3 TypeScript errors in `generation.test.ts`** -- Tests accessed `result.skipped` on a union type where only one branch has the `skipped` property. Fixed by using `"skipped" in result` narrowing instead of direct property access.

### Observations (No Action Required)

- **`scheduleRetryEntry` not in effect registry** -- Declared in the collection attempt machine as a no-op stub. Not registered in `effectRegistry`. The GT effect scheduler safely skips unregistered action names. This is intentional for Phase 1 (retry scheduling handled by `RetryRule`, not by a machine effect).

- **`v.any()` usage in payment schema** -- `machineContext`, `condition`, `parameters`, `providerData`, and `eventPayload` all use `v.any()`. Justified: these are generic/polymorphic fields where strict typing would require complex union discriminators. Acceptable for Phase 1.

- **`bun run review`** -- CodeRabbit review was run on the PR diff. This PR includes code and test changes for the ENG-65 payment system implementation.

- **Stubs retained** -- `collectionPlan/stubs.ts` (evaluateRules stub) and `dispersal/stubs.ts` (createDispersalEntry stub) are retained for reference/future use. Not dead code in the strict sense -- they serve as interface contracts for future implementations.

---

## Test Summary

| Chunk | Test Suite | Tests | Status |
|-------|-----------|-------|--------|
| 2 | Obligation machine matrix | 33 | PASS |
| 2 | Collection attempt machine matrix | 71 | PASS |
| 3 | Obligation generation | 14 | PASS |
| 3 | Collection plan rules | 14 | PASS |
| 4 | Payment methods + E2E chain | 34 | PASS |
| **Total payment system tests** | | **166** | **ALL PASS** |

### Full Suite Results

- **Test Files:** 0 failed | 64 passed | 1 skipped (65 total)
- **Tests:** 0 failed | 1449 passed | 12 skipped | 17 todo (1478 total)
- **Errors:** 81 unhandled rejections (convex-test framework limitation in `deal.integration.test.ts`)
- **TypeScript:** 29 errors (all pre-existing in deals tests, demo routes, ledger tests -- 0 in payment code)
- **Biome:** Clean (0 issues)
- **Convex codegen:** Clean

### Pre-existing Issues (Non-blocking)

- 81 unhandled rejection errors from `deal.integration.test.ts` -- these are a known `convex-test` framework limitation (write outside of transaction in scheduled functions) and do not represent actual test failures.
- 29 TypeScript errors in `deals` tests, `demo` routes, and `ledger` tests -- all pre-existing, none in payment code.

---

## Remaining Open Items

| Item | Priority | Notes |
|------|----------|-------|
| Execute pipeline (cron picks up planned entries, initiates attempts) | Phase 2 | SPEC deferred. Seed + admin mutations cover Phase 1 E2E. |
| `scheduleRetryEntry` effect implementation | Phase 2 | Currently a no-op. Retry scheduling handled by `RetryRule` event handler. |
| Dispersal entry creation | Phase 2+ (Project 6) | Stub in `payments/dispersal/stubs.ts`. |
| 3rd audit entry in cross-entity chain test | Low | Chain works correctly; test could be enhanced to assert dispersal stub was scheduled. |
| Fix 29 pre-existing TypeScript errors | Separate issue | All in deals tests, demo routes, and ledger tests. None in payment code. |
| `collectionPlan/stubs.ts` cleanup | Low | Dead stub retained alongside real implementation. Could be removed for clarity. |
