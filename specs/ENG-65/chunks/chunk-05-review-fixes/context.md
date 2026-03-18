# Chunk 5 Context: Code Review + Drift Fixes + Final Pass

## Drift Items to Verify/Fix

### D2 — evaluateRules stub (MEDIUM priority)
- **Location:** `convex/engine/effects/obligation.ts` — `emitObligationOverdue` handler
- **Problem:** Was calling `internal.payments.collectionPlan.stubs.evaluateRules` instead of `internal.payments.collectionPlan.engine.evaluateRules`
- **ENG-64 fix:** Description says "Fix: emitObligationOverdue calls stub evaluateRules instead of real engine"
- **Action:** Verify the fix is in place. If not, change the import to call the real engine.

### D4 — Schema deviations (LOW priority)
- **Obligations extra fields:** `borrowerId`, `paymentNumber`, `settledAt` — accepted enhancements
- **CollectionPlanEntries:** Extra `by_rescheduled_from` index (good); possibly missing `by_obligation` index
- **by_due_date index order:** SPEC says `["dueDate", "status"]`, code has `["status", "dueDate"]` — code is correct for cron queries
- **Action:** Check if `by_obligation` index exists. Note: Convex indexes on array fields have limitations.

## Code Quality Standards (from CLAUDE.md)
- **No `any` types** unless absolutely necessary
- **All auth via fluent-convex middleware chains** — no raw `ctx.auth.getUserIdentity()`
- **XState v5 pure functional API only** — `setup().createMachine()` + `transition()`, no actors
- **Audit logging via convex-audit-log** — hash-chained, tamper-evident
- **State machines as backbone** — Transition Engine is only code path modifying status fields
- **Biome for linting** — `bun check` auto-fixes then reports

## Verification Report Template
```markdown
# ENG-65 Verification Report

## DoD Checklist
| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Obligation machine matches SPEC §3.1 | ? | |
| 2 | Collection Attempt machine matches SPEC §4.1 | ? | |
| 3 | Obligations generate from mortgage terms | ? | |
| 4 | ScheduleRule creates plan entries, no duplicates | ? | |
| 5 | ManualPaymentMethod works E2E | ? | |
| 6 | MockPADMethod works | ? | |
| 7 | RetryRule creates retry entries | ? | |
| 8 | LateFeeeRule creates late fee, idempotent | ? | |
| 9 | Cross-machine chain works (3 audit entries) | ? | |
| 10 | OBLIGATION_OVERDUE fires to Mortgage | ? | |
| 11 | Partial settlement tracks correctly | ? | |
| 12 | Schema matches SPEC §9 | ? | |
| 13 | File structure matches SPEC §2 | ? | |
| 14 | PaymentMethod interface clean | ? | |

## Drift Resolution
| ID | Severity | Description | Resolution |
|----|----------|-------------|------------|
| D1 | CRITICAL | Missing CA effects | ? |
| D2 | MEDIUM | evaluateRules stub | ? |
| D3 | LOW | File structure prefix | Accepted — convex/engine/ convention |
| D4 | LOW | Schema deviations | ? |
| D5 | HIGH | No execute pipeline | ? |
| D6 | LOW | No payments/seed.ts | Accepted — test harness seeds |

## Code Quality
- Issues found:
- Issues fixed:

## Test Results
- Total tests:
- Passing:
- Failing:
```
