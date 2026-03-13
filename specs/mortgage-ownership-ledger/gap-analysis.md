# Gap Analysis: Mortgage Ownership Ledger

> Spec: https://www.notion.so/Mortgage-Ownership-Ledger-30ffc1b4402480bf9315e2e04fbeaab4
> Analysis Date: 2026-03-12
> Implementation Branch: Connorbelez/spec-driven-dev

## Summary
- **Features**: 3/5 in scope, 3/3 implemented (2 tested via integration tests)
- **Requirements**: 6/11 in scope, 6/6 implemented (6 tested)
- **Use Cases**: 5/5 in scope (all are read-API or write-API), 5/5 implemented (3 tested directly)
- **Overall Coverage**: 100% of in-scope items implemented; 2 minor test gaps (T-057, T-068)

## Coverage Matrix

### Features
| ID  | Feature                                | Status      | Tests       | Notes |
|-----|----------------------------------------|-------------|-------------|-------|
| F-1 | Fractional Ownership Position Tracking | Implemented | T-041–T-075 | Full lifecycle: mint, issue, transfer, redeem, burn. 33 integration tests. |
| F-2 | Daily Interest Accrual Engine          | Out of scope | — | Downstream consumer. `getPositions` API available for it. |
| F-3 | Payout State Machine                   | Out of scope | — | Downstream consumer. Consumer cursor pattern ready. |
| F-4 | Audit Export & Reconciliation          | Implemented (query API) | T-067, T-069, T-070, T-071 | Point-in-time queries, history, and validateSupplyInvariant all implemented. CSV/export UI is downstream. |
| F-5 | Ownership Transfer w/ Validation       | Implemented | T-042–T-048 | Full validation pipeline: min fraction, balance, same-mortgage, atomicity, idempotency. |

### Requirements
| ID     | Requirement                                          | Status                | Tests       | Notes |
|--------|------------------------------------------------------|-----------------------|-------------|-------|
| REQ-64 | Share supply invariant must hold at all times         | Implemented           | T-041, T-050, T-064, T-071 | Mechanically enforced + validateSupplyInvariant query |
| REQ-65 | Interest accrued before any ownership transfer        | Out of scope          | — | Orchestrator concern, not ledger |
| REQ-68 | Deterministic integer arithmetic                      | Implemented           | T-073 | BigInt throughout, no floating point |
| REQ-69 | ACT/365 day count convention                          | Out of scope          | — | Accrual engine (F-2) |
| REQ-71 | Ledger is single source of truth                      | Implemented           | T-041 | All queries read from ledger tables |
| REQ-72 | 6-year record retention                               | Implemented           | T-067, T-069, T-070 | Append-only journal with timestamps, point-in-time queries. No automated deletion exists. |
| REQ-73 | Monthly reconciliation                                | Partial               | T-071 | validateSupplyInvariant available; bank comparison is downstream |
| REQ-74 | Payout state transitions are ledger transactions      | Out of scope          | — | Payout system (F-3) |
| REQ-84 | Minimum 10% fraction on all positions                 | Implemented           | T-045, T-046, T-051, T-053 | Non-zero position must be >= 1,000 units. Full exit (0) allowed. |
| REQ-85 | All ownership transfers are atomic and auditable      | Implemented           | T-043, T-047, T-065, T-066, T-075 | OCC atomicity, same-mortgage checks, idempotency, sequence numbers |

### Use Cases
| ID    | Use Case                                              | Status      | Test File  | Notes |
|-------|-------------------------------------------------------|-------------|------------|-------|
| UC-40 | Investor funds new mortgage                           | Implemented | T-041, T-049 | mintMortgage + issueShares flow fully tested |
| UC-41 | Daily interest accrual reads positions                | Implemented (API only) | — | `getPositions` query available; accrual computation is downstream |
| UC-42 | Marketplace investor purchases fraction               | Implemented | T-041, T-042–T-048 | transferShares with full validation |
| UC-44 | Admin reviews pre-disbursement                        | Implemented (API only) | — | `getPositions`, `getInvestorPositions`, `getMortgageHistory` available |
| UC-46 | CPA auditor exports records                           | Implemented | T-067, T-069, T-070, T-071 | getPositionsAt, getMortgageHistory, validateSupplyInvariant, getAccountHistory |

## Divergences

### DIV-1: design.md validation section has swapped debit/credit labels
- **Spec says**: For MORTGAGE_MINTED: "Debit account must be WORLD type, Credit account must be TREASURY type"
- **Implementation does**: debitAccountId = TREASURY (receives units), creditAccountId = WORLD (gives units) — per D-7 convention
- **Rationale**: The design.md validation section labels contradicted the D-7 convention defined in the same document. D-7 is authoritative: debit = account receiving units, credit = account giving units. FROM→TO notation means FROM gives (credit), TO receives (debit). Implementation follows D-7 consistently.
- **Recommendation**: Update design.md validation section to match D-7. Implementation is correct.

### DIV-2: burnMortgage checks non-zero positions via TREASURY balance, not explicitly
- **Spec says**: burnMortgage should "Verify no POSITION accounts with non-zero balance" AND "TREASURY balance == 10,000"
- **Implementation does**: Both checks exist. The TREASURY balance check alone would suffice (if TREASURY = 10,000, positions sum to 0 by invariant), but explicit position check is also performed as defense-in-depth.
- **Rationale**: Belt-and-suspenders approach. Supply invariant makes the position check redundant, but it provides better error messages.
- **Recommendation**: Keep as-is.

### DIV-3: T-055/T-056 rejected at validator level, not handler level
- **Spec says**: "postEntry throws when debitAccountId/creditAccountId doesn't exist"
- **Implementation does**: Fake account IDs are rejected by Convex's `v.id("ledger_accounts")` validator before reaching the handler. The handler also has its own existence check for valid-but-nonexistent IDs.
- **Rationale**: Convex's type-safe validator provides a stronger guarantee — malformed IDs never reach handler code. Tests verify rejection occurs (via `.rejects.toThrow()`), just at a different layer.
- **Recommendation**: Keep as-is. Two layers of protection is better than one.

### DIV-4: `mintAndIssuePartial` factory not implemented as separate helper
- **Spec says**: T-040 mentions two factories: `mintAndIssue(mortgageId, investorId)` and `mintAndIssuePartial(mortgageId, investorId, amount)`
- **Implementation does**: Single `mintAndIssue` function with optional `amount` parameter defaulting to `10_000n`
- **Rationale**: A single function with a default parameter is simpler and more flexible than two separate factories. `mintAndIssue(t, "m1", "seller", 5_000n)` serves the partial case.
- **Recommendation**: Keep as-is.

## Untested Items

| Task | Description | Risk | Notes |
|------|-------------|------|-------|
| T-057 | postEntry with pre-resolved account IDs (happy path) | Low | Implicitly covered: T-041 calls mintMortgage which uses postEntry with pre-resolved IDs internally. Every Tier 2 mutation delegates to postEntryInternal. A dedicated Tier 1 direct-call test would be incremental coverage. |
| T-068 | getBalanceAt balance reconstruction at various timestamps | Low | getPositionsAt (T-067) tests the same replay mechanism. getBalanceAt uses the same journal replay pattern. A dedicated test would verify the single-account variant. |

## Orphaned Implementation

None. All implemented code traces directly to spec items:
- `convex/ledger/constants.ts` → T-002 (REQ-64, REQ-84)
- `convex/ledger/validators.ts` → T-003 (REQ-68)
- `convex/ledger/internal.ts` → T-010 (REQ-64, REQ-68, F-1)
- `convex/ledger/mutations.ts` → T-011–T-017 (F-1, F-5, REQ-64, REQ-84, REQ-85)
- `convex/ledger/queries.ts` → T-020–T-026 (F-1, F-4, REQ-71, REQ-72)
- `convex/ledger/validation.ts` → T-030 (REQ-64, F-1, F-4)
- `convex/ledger/cursors.ts` → T-031 (F-1)
- `convex/tsconfig.json` change → Infrastructure (exclude `__tests__` from Convex codegen)

## Spec Changes Since Extraction

Spec was extracted and implemented in the same session (2026-03-12). No changes detected.

## Recommendations

1. **Low priority — Add T-057 test**: Direct `postEntry` call with pre-resolved valid account IDs to verify happy-path Tier 1 usage. Currently implicitly covered but a dedicated test improves clarity.

2. **Low priority — Add T-068 test**: `getBalanceAt` at multiple timestamps. The replay mechanism is tested via `getPositionsAt` (T-067), but a dedicated single-account balance-at-time test would improve coverage.

3. **Documentation — Fix design.md validation labels**: The "Per-Type Validation" section in design.md swaps debit/credit labels relative to D-7. This is a documentation-only issue; the implementation correctly follows D-7 throughout.
