# ENG-9: Auth Test Harness & Integration Test Suite — Master Task List

## Phase 1: Test Infrastructure
- [x] T-001: Create `src/test/auth/permissions.ts` — role→permission truth table (ROLE_PERMISSIONS map + lookupPermissions helper)
- [x] T-002: Create `src/test/auth/helpers.ts` — MockIdentity interface, createMockIdentity, createMockViewer, createTestConvex, seedUser, seedFromIdentity
- [x] T-003: Create `src/test/auth/identities.ts` — pre-built identity fixtures for all 10 roles (FAIRLEND_ADMIN, EXTERNAL_ORG_ADMIN, BROKER, LENDER, BORROWER, LAWYER, JR_UNDERWRITER, UNDERWRITER, SR_UNDERWRITER, MEMBER)
- [x] T-004: Create `convex/test/authTestEndpoints.ts` — minimal test endpoints for every middleware chain
- [x] T-005: Run `bunx convex codegen` and verify generated API types include test endpoints

## Phase 2: Middleware Unit Tests
- [x] T-006: Create `src/test/auth/middleware/authMiddleware.test.ts` — Viewer construction, parseClaimArray edge cases, isFairLendAdmin derivation (8 test cases)
- [x] T-007: Create `src/test/auth/middleware/requireFairLendAdmin.test.ts` — FairLend Staff admin vs external org admin (4 test cases)
- [x] T-008: Create `src/test/auth/middleware/requireOrgContext.test.ts` — org presence, underwriter bypass (4 test cases)
- [x] T-009: Create `src/test/auth/middleware/requirePermission.test.ts` — permission checks, denial paths (4 test cases)
- [x] T-010: Create `src/test/auth/middleware/requireAdmin.test.ts` — admin role check (2 test cases)

## Phase 3: Chain & Permission Tests
- [x] T-011: Create `src/test/auth/chains/role-chains.test.ts` — all pre-built chains tested with correct/incorrect roles using chain×role matrix (190 tests)
- [x] T-012: Create `src/test/auth/permissions/role-permission-matrix.test.ts` — systematic describe.each over ROLE_PERMISSIONS truth table + underwriter hierarchy
- [x] T-013: Create `src/test/auth/permissions/new-permissions.test.ts` — 7 new permissions with correct role assignments (93 tests)
- [x] T-014: Add deprecated role validation tests — verify zero references to investor, platform_admin, org_admin, uw_manager

## Phase 4: Integration Tests & Cleanup
- [x] T-015: Create `src/test/auth/integration/onboarding-auth.test.ts` — onboarding mutations with auth enforcement (7 test cases)
- [x] T-016: Create `src/test/auth/integration/audit-auth-failure.test.ts` — auth failure error messages per middleware (7 test cases)
- [x] T-017: Run `bun check` + `bun typecheck` — both pass
- [x] T-018: Run `bun test` — 575 passed (2 pre-existing storybook failures, unrelated)
