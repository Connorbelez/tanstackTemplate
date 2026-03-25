# ENG-31 Gap Analysis — burnMortgage Convenience Mutation

**Date:** 2026-03-17
**Branch:** `Connorbelez/burn-mortgage-mutation`
**Commit:** `49302b3`

---

## Sources Compared

| Source | URL |
|--------|-----|
| Linear Issue (ENG-31) | https://linear.app/fairlend/issue/ENG-31 |
| Implementation Plan | https://www.notion.so/326fc1b440248122ad97f680a4903994 |
| UC-OL-04 / UC-108 | https://www.notion.so/322fc1b4402481c58fa8f0fc3d590048 |
| SPEC 1.3 — Mortgage Ownership Ledger | https://www.notion.so/322fc1b44024811f810ed1f93e5a69bd |

---

## Acceptance Criteria Status

### From Linear Issue (ENG-31)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC-1 | Posts MORTGAGE_BURNED entry: TREASURY → WORLD, amount = 10,000 | ✅ PASS | `mutations.ts:156-167` — calls `postEntry()` with `entryType: "MORTGAGE_BURNED"`, `amount: Number(TOTAL_SUPPLY)` |
| AC-2 | Precondition: TREASURY balance MUST == 10,000 | ✅ PASS | `mutations.ts:132-137` — checks `treasuryBalance !== TOTAL_SUPPLY`, throws `TREASURY_NOT_FULL` |
| AC-3 | Precondition: ALL POSITIONs for this mortgage MUST == 0 | ✅ PASS | `mutations.ts:140-151` — iterates all POSITION accounts, throws `POSITIONS_NOT_ZERO` if any non-zero |
| AC-4 | Post-burn: WORLD balance restored, TREASURY = 0, all records preserved | ✅ PASS | `postEntry` handles double-entry bookkeeping; existing test T-041 validates full lifecycle |
| AC-5 | validateSupplyInvariant returns valid: true, total: 0 after burn | ✅ FIXED | `queries.ts:145-149` and `validation.ts:56-59` — added `isBurned` condition. New test T-077 asserts this. |
| AC-6 | Auth: adminMutation (admin role required) | ⚠️ DRIFT | `mutations.ts:109` uses `adminMutation`. See DRIFT-1 below. |
| AC-7 | Rejects if any POSITION > 0 or TREASURY != 10,000 with structured ConvexError | ✅ PASS | Uses `ConvexError` with codes `TREASURY_NOT_FOUND`, `TREASURY_NOT_FULL`, `POSITIONS_NOT_ZERO` |
| AC-8 | Tests: happy path, premature burn rejection, double-burn idempotency | ✅ PASS | T-041 (lifecycle), T-059 (position rejection), T-060 (treasury rejection), T-076 (idempotency) |

### From UC-108 (Use Case)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| UC-1 | burnMortgage creates a TREASURY → WORLD entry for exactly 10,000 units | ✅ PASS | `mutations.ts:156-167` + `postEntry.test.ts:235` |
| UC-2 | TREASURY balance goes to 0 | ✅ PASS | T-041 validates treasury=0 after burn |
| UC-3 | WORLD balance becomes less negative by 10,000 | ✅ PASS | postEntry double-entry bookkeeping ensures this |
| UC-4 | If any POSITION balance is non-zero, burn is rejected | ✅ PASS | T-059 tests this |
| UC-5 | If TREASURY balance ≠ 10,000, burn is rejected | ✅ PASS | T-060 tests this |
| UC-6 | Journal entry records the discharge with full provenance | ✅ PASS | `postEntry` records `source`, `reason`, `metadata`, `effectiveDate` |

### From Implementation Plan (Notion)

| # | Item | Status | Notes |
|---|------|--------|-------|
| Step 1 | Fix validateSupplyInvariant (queries.ts) | ✅ DONE | Added `isBurned` condition |
| Step 2 | Fix validateSupplyInvariant (validation.ts) | ✅ DONE | Added `isBurned` condition |
| Step 3 | Add double-burn idempotency test | ✅ DONE | Added as T-076 (plan suggested T-061, but that ID was taken) |
| Step 4 | Add post-burn invariant test | ✅ DONE | Added as T-077 (plan suggested T-062, but that ID was taken) |
| Step 5 | (Optional) Add canBurn pre-flight query | ❌ NOT DONE | See GAP-2 below |

---

## Identified Gaps

### GAP-1: Auth Middleware — DRIFT-1 from Plan (Low Risk, Intentional)

**Spec says:** `adminMutation` (admin role required)
**Code uses:** `adminMutation` ✅

The Implementation Plan flagged this as a drift (DRIFT-1), suggesting `ledgerMutation` (permission-based) might be more correct per RBAC principles. However, the actual code uses `adminMutation` which **matches the spec exactly**. The plan's recommendation to switch was never acted on, and the code is consistent with the Linear issue's AC-6.

**Verdict:** No gap. Code matches spec. The plan's suggestion is a future improvement, not a current deficiency.

### GAP-2: `canBurn` Pre-flight Query (Deferred)

**Linear issue says:** "Consider adding `canBurn(mortgageId)` pre-flight query (Open Question #3)"
**Implementation plan says:** "Decision needed: Should canBurn be implemented now or deferred?"
**Code:** Not implemented.

**Verdict:** This was explicitly marked as optional/open question. Not a gap — it's a deferred decision. Should be tracked as a separate ticket if needed.

### GAP-3: Duplicate `validateSupplyInvariant` (Tech Debt)

**Implementation Plan Open Question #3:** "Should one be removed to follow DRY?"
**Code:** Both `queries.ts` and `validation.ts` still have separate implementations.

**Verdict:** Both implementations now work correctly (both have `isBurned`), but the duplication remains tech debt. The two implementations have slightly different return shapes and error handling (validation.ts returns early with `valid: false` when no treasury; queries.ts returns 0n balances). This is a DRY violation but not a functional gap.

**Recommendation:** Create a follow-up ticket to consolidate or document why both exist.

### GAP-4: UC-108 Precondition — Mortgage Terminal State Check

**UC-108 says:** "Preconditions: Mortgage is in a terminal state (matured or written_off)"
**Code:** `burnMortgage` does NOT check mortgage lifecycle state. It only checks treasury balance and position balances.

**Verdict:** This is by design per the project's "Seed, don't build flows" principle (CLAUDE.md). The orchestration layer (Phase 2+) handles lifecycle state machine transitions. The ledger layer only validates financial invariants. However, this should be documented as a known gap that Phase 2 orchestration must enforce.

---

## Summary

| Category | Count |
|----------|-------|
| ✅ Acceptance Criteria Met | 14/14 (all Linear + UC criteria) |
| ✅ Implementation Steps Done | 4/4 mandatory steps |
| ⚠️ Deferred Items | 1 (canBurn query — explicitly optional) |
| ⚠️ Tech Debt | 1 (duplicate validateSupplyInvariant) |
| ⚠️ Phase 2 Dependency | 1 (mortgage terminal state check) |
| ❌ Blocking Gaps | 0 |

**Overall:** All acceptance criteria are satisfied. The three remaining items are either explicitly deferred, tech debt for a follow-up, or documented Phase 2 scope. ENG-31 is ready for review.
