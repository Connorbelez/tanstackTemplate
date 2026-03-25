# PR Review: ENG-165 — Transfer Reconciliation & Self-Healing

**Branch:** `03-24-eng-165` (1 commit, ~2,600 lines, 10 source files)
**Risk:** CRITICAL
**Recommendation:** REQUEST CHANGES

---

## Executive Summary

The reconciliation check functions are well-structured with clean separation, proper idempotency keys, and good accounting semantics. However, **the self-healing cron has 3 independent bugs that make outbound transfer healing completely non-functional**, and the entire reconciliation system can silently fail with zero alerting. These must be fixed before merge.

---

## Critical Issues (must fix before merge)

### C-1. Outbound transfer healing is triple-broken

Three independent bugs confirm outbound escalation cannot work:

| Bug | Source | File | Line |
|-----|--------|------|------|
| `lenderId` never populated in `TransferHealingCandidate` | Code Reviewer, Silent Failure Hunter | `transferReconciliationCron.ts` | 115-123, 236 |
| `SUSPENSE_ESCALATED` entry type constraint only allows `BORROWER_RECEIVABLE` as credit family | Comment Analyzer, Type Design | `types.ts` | 96-98 |
| `findOrphanedConfirmedTransfersForHealing` uses `.first()` (any entry) instead of checking specific entry type | Code Reviewer | `transferReconciliationCron.ts` | 92-100 |

**Impact:** Outbound transfers that become orphaned will never be healed. They'll bounce between retry (which is a no-op, see C-3) and escalation (which throws), creating an infinite failure loop.

**Fix:** (a) Add `lenderId` to `TransferHealingCandidate` and populate it. (b) Update `ENTRY_TYPE_FAMILIES` for `SUSPENSE_ESCALATED` to allow `LENDER_PAYABLE`. (c) Mirror the specific entry-type check from `checkOrphanedConfirmedTransfers`.

---

### C-2. No error handling in cron actions — single failure silently kills entire system

| Location | Issue |
|----------|-------|
| `transferReconciliationCron.ts:344` | No try-catch in healing loop — one throwing candidate aborts all remaining |
| `reconciliationCron.ts:94` | No try-catch in daily reconciliation — suite failure produces zero alerts |

**Impact:** If any single database query or mutation fails, all reconciliation stops silently. Combined with C-4, one broken check kills all 14. For a lending platform under O.Reg 189/08, this is a compliance risk — no evidence that reconciliation even attempted to run.

**Fix:** Wrap the healing loop in per-candidate try-catch. Wrap the reconciliation action in try-catch with fallback audit logging.

---

### C-3. Placeholder retry effect fakes successful healing

**File:** `transferReconciliationCron.ts:135-148`

`retryTransferConfirmationEffect` is a `console.warn` no-op, but the cron counts it as `"retriggered"` in its summary. Operators see "3 retriggered" and believe healing is working. After `MAX_TRANSFER_HEALING_ATTEMPTS` (3) no-op retries (~45 min), every orphan escalates to SUSPENSE regardless of whether the issue was transient.

**Fix:** Either throw from the placeholder so it doesn't silently pretend to work, or don't count "retriggered" in the summary. Add a `TODO(ENG-XXX)` ticket.

---

### C-4. `Promise.all` in reconciliation suite — one check failure kills all 14

**File:** `reconciliationSuite.ts:700-722`

If any single check throws (missing index, precision overflow, schema mismatch), the entire `Promise.all` rejects and all 13 other check results are discarded.

**Fix:** Use `Promise.allSettled` and report which checks failed vs succeeded.

---

## Important Issues (should fix)

### I-1. DRY violation: orphan detection logic duplicated

`findOrphanedConfirmedTransfersForHealing` (cron) reimplements the same filtering as `checkOrphanedConfirmedTransfers` (check). The divergent journal entry check (C-1) is a direct consequence.

**Fix:** Extract shared filtering into a reusable function; healing query adds only the escalation-status filter.

### I-2. `makeInternalRef` double-cast bypasses type safety

`as unknown as` is functionally `any`. The `lenderId` bug (C-1) is a direct example — the ref type declares `lenderId` as accepted, but no type error is raised when it's missing.

**Fix:** Use Convex's typed `internal.*` references, or add runtime arg validation.

### I-3. `direction` typed as `v.string()` instead of union

**File:** `transferReconciliationCron.ts:138, 157`

Any string passes validation. A typo silently falls through to the outbound code path.

**Fix:** Use `v.union(v.literal("inbound"), v.literal("outbound"))`.

### I-4. Legacy stubs silently skipped without logging (4 locations)

Transfers missing `direction` or `amount` are invisible to all reconciliation. Could represent real money.

**Files:** `transferReconciliation.ts:113,188,294` + `transferReconciliationCron.ts:87`

**Fix:** Add `console.warn` per skipped transfer, and consider a dedicated data-quality check.

### I-5. Missing dispersal entry silently skipped

**File:** `transferReconciliation.ts:249-253`

A confirmed outbound transfer referencing a deleted dispersal entry is a data integrity violation, not something to skip.

**Fix:** Flag as its own reconciliation finding rather than `continue`.

### I-6. `transferRequests` schema is dangerously loose

`amount`, `direction`, `confirmedAt` are all optional regardless of status. Every consumer must defensively null-check.

**Fix:** Consider status-dependent validation or at minimum document which fields are guaranteed per status.

### I-7. No audit trail for healthy reconciliation runs

**File:** `reconciliationCron.ts:96-97`

Only unhealthy runs are audited. An auditor asking "prove reconciliation ran every day this quarter" has no evidence for healthy days.

**Fix:** Log a "passed" audit entry with zero gaps on healthy runs.

### I-8. Sample ID extraction misses `transferRequestId`

**File:** `reconciliationCron.ts:110-119`

All transfer reconciliation findings are logged with `sampleIds: ["unknown"]`.

**Fix:** Add `transferRequestId`, `journalEntryId`, `dispersalEntryId` to the extraction chain.

### I-9. `TransferHealingResult` has hidden count invariant

`candidatesFound ≠ retriggered + escalated` because "skipped" candidates are untracked. Add a `skipped` field.

### I-10. `?? 0` fallback hides unknown financial amounts

**File:** `transferReconciliation.ts:260`

A missing amount reads as $0.00, understating financial exposure in reports.

---

## Test Coverage Gaps

| Gap | Criticality | Description |
|-----|-------------|-------------|
| `transferReconciliationCron` action | 9/10 | Production cron entry point is completely untested |
| `findOrphanedConfirmedTransfersForHealing` | 8/10 | Healing query has subtle differences from check — untested |
| Escalation without `mortgageId` | 8/10 | Distinct error path (no journal entry created) — untested |
| Outbound direction mapping | 7/10 | All tests use `direction: "inbound"` — outbound never tested |
| Reversed transfer threshold | 6/10 | No test for 5-minute grace period on reversals |
| Legacy stub filtering | 6/10 | No test creates transfer without direction/amount |
| Multiple journal entries per transfer | 6/10 | Mismatch check iterates all entries — edge case untested |
| `reconciliationQueries.ts` endpoints | 5/10 | 4 new query endpoints with mortgage filtering — untested |

---

## Comment Issues

| Issue | Description |
|-------|-------------|
| Task ID collision | T-006 through T-009 used in both `transferReconciliation.ts` and `reconciliationSuite.ts` for different checks |
| Fragile check count | "Runs all 8 check functions, 2 conservation checks, and 4 transfer checks" will rot on next change |
| Misleading escalation comment | Says "credit LENDER_PAYABLE for outbound" but type constraint doesn't allow it |
| 4 code paths, not 3 | `retriggerTransferConfirmation` has 4 paths (skip, escalate+journal, escalate-no-journal, retry) |

---

## Strengths

- Reconciliation check functions are clean, well-separated, with proper idempotency key construction
- Good accounting semantics in docstrings (credit-normal/debit-normal explanations)
- Schema additions and index design are appropriate
- Test harness uses real `convex-test` with proper schema registration (not mocks)
- Test utilities are well-structured with reusable factories (DRY)
- Self-healing test covers all 3 code paths (retry, escalate, skip) with DB state assertions
- Temporal dependencies between cron jobs are well-documented
- `approxAccountCreatedAt` has excellent mathematical reasoning comment

---

## Blast Radius (GitNexus)

- All changes are **contained within CashLedger module** — no external callers broken
- 7 execution flows affected, all rooted in `RunFullReconciliationSuite`
- New checks plug cleanly into existing orchestrator
- `buildResult` is the highest-risk helper (called by all 4 new checks)

---

## Recommended Action Plan

1. **Fix C-1** (outbound healing triple-bug) — most impactful single fix
2. **Fix C-2** (error handling in crons) — prevents silent total failure
3. **Fix C-3** (placeholder clarity) — prevent false confidence in healing
4. **Fix C-4** (`Promise.allSettled`) — prevent cascade failures
5. **Fix I-1** (extract shared filtering) — eliminates root cause of C-1's journal check divergence
6. Add tests for cron action, outbound direction, escalation paths
7. Address remaining important issues
8. Re-run review after fixes
