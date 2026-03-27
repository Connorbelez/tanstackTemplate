# Chunk 01: Auth/Entity Guard — Status

Completed: 2026-03-27

## Tasks Completed
- [x] T-001: Added ID-space helpers in `convex/payments/transfers/types.ts` (`DomainEntityId`, `AuthPrincipalId`, `isWorkOsAuthPrincipalId`, `assertDomainEntityId`).
- [x] T-002: Added runtime validation in `createTransferRequest` to reject WorkOS auth-ID-shaped `counterpartyId` values before persistence.
- [x] T-003: Added tests for auth/entity guard behavior in `convex/payments/transfers/__tests__/mutations.test.ts`.
- [x] T-004: Added ID-space documentation in `convex/schema.ts` and `convex/auth/resourceChecks.ts`.
- [x] T-005: Audited and reinforced boundary normalization in `convex/dispersal/createDispersalEntries.ts` (auth ID -> lender entity ID comment at normalization boundary).

## Tasks Incomplete
- [ ] T-006: Full quality gate all-pass
  - Blocker 1: `bun typecheck` fails due to unrelated existing repo issue: `convex/payments/cashLedger/__tests__/chaosTests.test.ts(16,8): Cannot find module './e2eHelpers'`
  - Blocker 2: `bunx convex codegen` fails in this environment: `No CONVEX_DEPLOYMENT set`

## Quality Gate
- `bun check`: pass (with existing complexity warnings in unrelated files)
- `bun typecheck`: fail (unrelated pre-existing missing test helper module)
- `bunx convex codegen`: fail (environment not configured: missing `CONVEX_DEPLOYMENT`)

## Notes
- `coderabbit review --plain` was attempted per AGENTS guidance but hung while connecting to the review service in this environment.
- Targeted transfer mutation test file passes.
