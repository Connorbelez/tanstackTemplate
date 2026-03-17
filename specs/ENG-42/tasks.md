# ENG-42 — End-to-End Verification & Definition of Done

## Status Key
- `[ ]` — Not started
- `[x]` — Completed
- `[~]` — Partial / Blocked

## Drift Report (Updated 2026-03-17)

The Notion implementation plan was written before PR #105 merged. Actual state:

| Item | Plan Said | Actual State |
|------|-----------|--------------|
| `commitReservation` | ❌ Missing | ✅ mutations.ts:579 |
| `voidReservation` | ❌ Missing | ✅ mutations.ts:664 |
| `concurrency.test.ts` | ❌ Missing | ✅ 8+ tests |
| `reservation.test.ts` commit/void | ❌ Missing | ✅ 18+ tests |
| `postCorrection` | ❌ Missing | ✅ mutations.ts (adminMutation) |
| `lifecycle.test.ts` | ❌ Missing | ✅ 4 lifecycle tests |
| `pointInTime.test.ts` | ❌ Missing | ✅ 4 determinism tests |
| `getBalanceAt`/`getPositionsAt` | ⏳ ENG-38 in review | ✅ Merged in queries.ts |

## Tasks

### Chunk 1: postCorrection Mutation + Tests (AC #8) ✅
- [x] T-001: Implement `postCorrection` adminMutation in `convex/ledger/mutations.ts`
- [x] T-002: Add `postCorrectionArgsValidator` import to mutations.ts
- [x] T-003: Write postCorrection tests in `convex/ledger/__tests__/convenienceMutations.test.ts` (6 tests)
- [x] T-004: Quality gate — bun check passes, 27/27 tests pass

### Chunk 2: Lifecycle + Point-in-Time Tests (AC #1, #2, #4, #10) ✅
- [x] T-005: Create `convex/ledger/__tests__/lifecycle.test.ts` — 4 lifecycle tests
- [x] T-006: Add multi-mortgage lifecycle with reservations scenario
- [x] T-007: Create `convex/ledger/__tests__/pointInTime.test.ts` — 4 determinism tests
- [x] T-008: Quality gate — bun check passes, 8 new tests pass

### Chunk 3: Auth Gate Tests + Final Verification (AC #9, quality) ✅
- [x] T-009: Auth rejection tests for admin mutations (3 tests) + ledger mutations (2 tests)
- [x] T-010: Auth rejection tests for ledger queries (5 tests) + auth success (1 test)
- [x] T-011: Full test suite — 14 ledger files, 197 tests passing, 0 failures
- [x] T-012: Quality checks — bun check clean, bun typecheck clean (new files)
