# ENG-163: Multi-entry Posting Group Validation — Tasks

## Chunk 1: Posting Group Validation Module
- [x] T-001: Create `postingGroups.ts` with `validatePostingGroupAmounts()` pure function
- [x] T-002: Add `getPostingGroupSummary()` query helper that loads entries by `by_posting_group` index and computes CONTROL:ALLOCATION balance
- [x] T-003: Add `isPostingGroupComplete()` pure predicate

## Chunk 2: Integration, Query, and Reconciliation
- [x] T-004: Add pre-validation to `postSettlementAllocation()` in `integrations.ts` — reject mismatched sums before any writes
- [x] T-005: Add `getPostingGroupEntries` public query to `queries.ts`
- [x] T-006: Add `findNonZeroPostingGroups()` to `reconciliation.ts` + internal query wrapper

## Chunk 3: Tests
- [x] T-007: Unit tests for `validatePostingGroupAmounts`, `getPostingGroupSummary`, `isPostingGroupComplete`
- [x] T-008: Integration tests — atomic rejection, reconciliation alerts, query-as-unit, complete group check
