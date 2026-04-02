- [x] T-001 Gather ENG-235 Linear, Notion, and local codebase context for listings, ledger, auth, and schema contracts.
- [x] T-002 Implement base listing read queries and ledger-backed availability helper in `convex/listings/queries.ts`.
- [x] T-003 Implement published/admin listing list queries with filtering, sorting, and cursor pagination.
- [x] T-004 Implement public linked-entity queries for appraisals, encumbrances, and transaction history.
- [x] T-005 Add Convex integration tests and register listings modules in the convex test module map.
- [ ] T-006 Run `bunx convex codegen`, `bun check`, `bun typecheck`, and a code review pass; fix follow-up issues.
  Validation note: `bun check` and `bun typecheck` passed, and targeted listing query tests passed. `bunx convex codegen` is blocked in this worktree because `CONVEX_DEPLOYMENT` is not configured. `coderabbit review --plain` was started but did not return output before timing out locally.
