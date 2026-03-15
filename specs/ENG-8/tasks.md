# ENG-8: Auth Event Audit Logging — Master Task List

## Chunk 1: Audit Client & Helpers
- [x] T-001: Create shared production audit log client (`convex/auditLog.ts`)
- [x] T-002: Create `isMutationContext()` type guard and `auditAuthFailure()` helper (`convex/auth/auditAuth.ts`)

## Chunk 2: Middleware Integration & Mutation Logging
- [x] T-003: Add audit logging to `authMiddleware` failure path in `convex/fluent.ts`
- [x] T-004: Add audit logging to `requireFairLendAdmin` failure path in `convex/fluent.ts`
- [x] T-005: Add audit logging to `requireOrgContext` failure path in `convex/fluent.ts`
- [x] T-006: Add audit logging to `requireAdmin` failure path in `convex/fluent.ts`
- [x] T-007: Add audit logging to `requirePermission()` failure path in `convex/fluent.ts`
- [x] T-008: Add audit logging to `requestRole` mutation in `convex/onboarding/mutations.ts`
- [x] T-009: Add audit logging to `approveRequest` mutation in `convex/onboarding/mutations.ts`
- [x] T-010: Add audit logging to `rejectRequest` mutation in `convex/onboarding/mutations.ts`
- [x] T-011: Add audit logging to `assignRoleToUser` effect success/failure in `convex/engine/effects/onboarding.ts`

## Chunk 3: Admin Queries & Verification
- [x] T-012: Create admin audit query functions in `convex/audit/queries.ts`
- [x] T-013: Run `bun check`, `bun typecheck`, `bunx convex codegen`
- [x] T-014: Verify all existing tests still pass (`bun run test`)
