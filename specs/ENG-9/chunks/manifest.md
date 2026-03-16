# ENG-9 Chunk Manifest

| Chunk | Tasks | Status |
|-------|-------|--------|
| chunk-01-test-infrastructure | T-001 through T-005 (5 tasks) | complete |
| chunk-02-middleware-tests | T-006 through T-010 (5 tasks) | complete |
| chunk-03-chain-permission-tests | T-011 through T-014 (4 tasks) | complete |
| chunk-04-integration-cleanup | T-015 through T-018 (4 tasks) | complete |

## Execution Order
1. **chunk-01** — Foundation: truth table, mock utilities, identity fixtures, test endpoints, codegen
2. **chunk-02** — Middleware unit tests: authMiddleware, requireFairLendAdmin, requireOrgContext, requirePermission, requireAdmin
3. **chunk-03** — Chain and permission matrix tests: role-chains, role-permission-matrix, new-permissions, deprecated role validation
4. **chunk-04** — Integration tests + quality gates: onboarding-auth, audit-auth-failure, bun check, bun typecheck, bun test
