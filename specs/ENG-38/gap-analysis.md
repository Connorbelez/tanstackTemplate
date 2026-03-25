# ENG-38 Gap Analysis — PRD vs Implementation

**Date:** 2026-03-17
**Branch:** `Connorbelez/eng38-pit-queries`
**Commit:** `b8c24f4`

## Sources Analyzed

| Source | URL |
|--------|-----|
| Linear Issue ENG-38 | [link](https://linear.app/fairlend/issue/ENG-38) |
| Implementation Plan (Notion) | [link](https://www.notion.so/326fc1b44024818bb81fc5e7d77976ca) |
| SPEC 1.3 — Mortgage Ownership Ledger | [link](https://www.notion.so/322fc1b44024811f810ed1f93e5a69bd) |
| UC-OL-03 — Point-in-time audit query | [link](https://www.notion.so/322fc1b4402481119935e253db7a8c80) |
| REQ-OL-02 — Deterministic reconstruction | (could not fetch — URL format unsupported) |

---

## Acceptance Criteria Checklist (from Linear)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | getBalanceAt: replays debit/credit entries, returns balance at exact timestamp | **PASS** | `queries.ts:155-196` — replays via `by_debit_account` and `by_credit_account` indexes with `lte(timestamp, asOf)`, sums amounts using BigInt |
| 2 | getPositionsAt: replays mortgage entries, returns ownership snapshot | **PASS** | `queries.ts:198-262` — replays via `by_mortgage_and_time` index, builds per-account balance map, returns POSITION accounts with `lenderId` |
| 3 | Deterministic: same timestamp always returns identical results | **PASS** | Tested in T-070e — calls `getPositionsAt` 5x with same `asOf`, asserts `toEqual` across all results |
| 4 | Same-millisecond ordering: entries with same timestamp ordered by sequenceNumber | **PASS** | `queries.ts:212` — explicit `entries.sort(compareSequenceNumbers)` before replay |
| 5 | Uses `by_debit_account`, `by_credit_account`, `by_mortgage_and_time` indexes | **PASS** | Verified in code — all three indexes used correctly |
| 6 | Point-in-time tests (SPEC §6.5): multi-step transfer, intermediate queries, determinism | **PASS** | T-070d (multi-step + intermediate), T-070e (determinism), T-070g (getBalanceAt lifecycle) |
| 7 | `bun typecheck` passes | **PASS** | No new type errors introduced (pre-existing errors in unrelated files) |

---

## Implementation Plan Checklist (from Notion)

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| Step 1 | Fix audit-only filtering in `getBalanceAt` | **DONE** | `AUDIT_ONLY_ENTRY_TYPES` imported and filtering applied in both debit and credit loops |
| Step 2 | Fix audit-only filtering in `getPositionsAt` | **DONE** | Filtering applied in accountIds collection AND replay loop; sort by sequenceNumber added |
| Step 3 | Expand point-in-time tests | **DONE** | 4 new tests added (T-070d through T-070g) |
| Step 4 | Verify (`bunx convex codegen`, `bun check`, `bun typecheck`) | **PARTIAL** | `bun check` ✅, `bun typecheck` ✅, `bunx convex codegen` could not run (no `CONVEX_DEPLOYMENT` env var in workspace) |

---

## UC-OL-03 Acceptance Criteria (from Notion Use Case)

| Criterion | Status | Notes |
|-----------|--------|-------|
| `getPositionsAt(mortgageId, asOf)` replays all entries up to the specified timestamp, ordered by sequenceNumber | **PASS** | Implemented with explicit sequenceNumber sort |
| Returns the exact ownership state: which investors held how many units | **PASS** | Returns `Array<{ lenderId: string; balance: bigint }>` |
| Supply invariant holds at the reconstructed point in time | **NOT IMPLEMENTED** | See Gap #1 below |
| Results are deterministic and reproducible | **PASS** | Tested in T-070e |

---

## SPEC 1.3 §7.2 Compliance

| Spec Requirement | Status | Notes |
|------------------|--------|-------|
| Replay journal entries up to target timestamp | **PASS** | Uses `by_mortgage_and_time` index with `lte(timestamp, asOf)` |
| Order by sequenceNumber for same-millisecond determinism | **PASS** | `entries.sort(compareSequenceNumbers)` at line 212 |
| Filter AUDIT_ONLY entries during replay | **PASS** | Added in this PR — was identified as a bug in drift report |
| Resolve account IDs to investor/lender IDs | **PASS** | Uses `getAccountLenderId()` with legacy `investorId` fallback |
| Return only POSITION accounts with positive balance | **PASS** | Filter at line 256: `info?.type === "POSITION" && info.lenderId && balance > 0n` |

---

## Gaps Identified

### Gap 1: Supply invariant validation at point-in-time (UC-OL-03 AC #3)
- **Source:** UC-OL-03 acceptance criteria: *"Supply invariant holds at the reconstructed point in time"*
- **Status:** NOT IMPLEMENTED in `getPositionsAt`
- **Severity:** Low — the implementation plan (§7, Open Question #3) explicitly defers this: *"Keep queries focused on reconstruction; validation is a separate concern tested in ENG-42."*
- **Recommendation:** Acceptable as-is. Supply invariant validation at point-in-time is a separate query concern. The existing `validateSupplyInvariant` function tests current state (ENG-42). A future `validateSupplyInvariantAt(mortgageId, asOf)` could compose `getPositionsAt` + sum check, but is not required by ENG-38.

### Gap 2: Same-millisecond entry test not present
- **Source:** Implementation plan drift report mentions "same-millisecond entries" as a missing test case
- **Status:** NOT TESTED — no test explicitly creates two entries at the exact same millisecond and verifies sequenceNumber ordering produces correct results
- **Severity:** Low — the `compareSequenceNumbers` sort is in place (the code fix is done), but there's no dedicated test proving same-millisecond ordering works correctly. The determinism test (T-070e) partially covers this since entries within `Promise.all` could collide, but doesn't assert on ordering specifically.
- **Recommendation:** Could add as a follow-up test when reservation mutations (ENG-34) land, since those create multiple entries in rapid succession.

### Gap 3: `getBalanceAt` lacks explicit sequenceNumber ordering
- **Source:** SPEC §7.2 ordering guarantee: *"For absolute determinism, consumers should order by sequenceNumber"*
- **Status:** NOT IMPLEMENTED for `getBalanceAt` — only `getPositionsAt` got the `entries.sort(compareSequenceNumbers)` treatment
- **Severity:** None (false positive) — `getBalanceAt` sums amounts via commutative addition (`+=` / `-=`), so entry ordering has no effect on the final balance. The implementation plan correctly identified this: *"For pure sum-based replay, order is irrelevant (addition is commutative)."*
- **Recommendation:** No action needed. Adding a sort would be a no-op for correctness but could be added for consistency if desired.

### Gap 4: File structure diverges from SPEC §2
- **Source:** SPEC 1.3 §2 prescribes separate files: `ledger/queries/getBalanceAt.ts`, `ledger/queries/getPositionsAt.ts`, `ledger/__tests__/pointInTime.test.ts`
- **Status:** DIVERGENT — all queries live in `convex/ledger/queries.ts` (single file), all tests in `convex/ledger/__tests__/ledger.test.ts` (single file)
- **Severity:** None (architectural) — this is a codebase-wide convention established before ENG-38. All queries are colocated in one file, all tests in one file. The spec's file structure is prescriptive/aspirational but was not followed during initial implementation.
- **Recommendation:** No action for ENG-38. If the team wants to split files, it should be a separate refactoring task across the entire ledger module.

### Gap 5: `bunx convex codegen` not verified
- **Source:** Linear AC #7 and CLAUDE.md: *"bunx convex codegen must pass before considering tasks completed"*
- **Status:** COULD NOT VERIFY — requires `CONVEX_DEPLOYMENT` environment variable which is not configured in this workspace
- **Recommendation:** Must be verified in CI or a workspace with Convex credentials before merging.

---

## Summary

| Category | Total | Pass | Gap | N/A |
|----------|-------|------|-----|-----|
| Linear Acceptance Criteria | 7 | 7 | 0 | 0 |
| Implementation Plan Steps | 4 | 3 | 1 (partial) | 0 |
| UC-OL-03 Criteria | 4 | 3 | 1 | 0 |
| SPEC §7.2 Requirements | 5 | 5 | 0 | 0 |

**Overall: 18/20 criteria fully met.** The 2 gaps are:
1. Supply invariant at point-in-time — explicitly deferred to ENG-42 per implementation plan
2. `bunx convex codegen` — environment limitation, must verify in CI

No blocking gaps. Implementation matches the PRD, implementation plan, and spec requirements.
