# Tasks: ENG-6 — Implement resource ownership checks and closingTeamAssignments table

Source: Linear ENG-6, Notion implementation plan
Generated: 2026-03-16

## Phase 1: Schema Verification
- [x] T-001: Verify `closingTeamAssignments` table exists in `convex/schema.ts` with correct fields and indexes. Confirmed — no changes needed.

## Phase 2: Resource Ownership Module — Helpers
- [x] T-002: Create `convex/auth/resourceChecks.ts` with `getLenderMortgageIds` helper.
- [x] T-003: Add `isBrokerForMortgage` helper.

## Phase 3: Resource Ownership Module — Core Checks
- [x] T-004: Implement `canAccessMortgage` — admin, borrower (via mortgageBorrowers), broker, lender, lawyer.
- [x] T-005: Implement `canAccessDeal` — admin, broker, lender (buyer/seller), lawyer (closingTeam + dealAccess).
- [x] T-006: Implement `canAccessLedgerPosition` — admin, lender, broker.
- [x] T-007: Implement `canAccessAccrual` — admin, lender (own), broker (client).
- [x] T-008: Implement `canAccessDispersal` — admin, lender (own only).
- [x] T-009: Implement `canAccessDocument` — stub for ENG-144, admin-only for now.
- [x] T-010: Implement `canAccessApplicationPackage` — admin, sr_underwriter, jr/uw pool+claim, review_decisions.

## Phase 4: Naming Renames
- [x] T-011: Searched for `investor` role references — none found (only schema field names + legacy compat).
- [x] T-012: Searched for `isPlatformAdmin` and `uw_manager` — zero references found. Already cleaned up.

## Phase 5: Tests
- [x] T-013: Created test file with Viewer factory, 10+ fixture insertion helpers.
- [x] T-014: 10 tests for `canAccessMortgage` — all pass.
- [x] T-015: 22 tests for `canAccessDeal`, `canAccessLedgerPosition`, `canAccessAccrual`, `canAccessDispersal` — all pass.
- [x] T-016: 11 tests for `canAccessApplicationPackage` — all pass.

## Phase 6: Quality Gate
- [x] T-017: `bun check` ✓, `bun typecheck` ✓, 43/43 tests pass ✓.
