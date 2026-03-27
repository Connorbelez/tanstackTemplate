# Chunk 4 Context: Tests and Quality

## Source Context (Notion Implementation Plan ENG-201)
Testing expectations:
- Add coverage for:
  - `cancelTransfer` valid/invalid state behavior
  - `retryTransfer` creates a new transfer with fresh idempotency key
  - `confirmManualTransfer` allowed only for manual provider transfers
  - Query behavior for counterparty/deal/timeline lookups
- Ensure permission enforcement paths are covered where practical.

## Existing Test Reality
- Current `convex/payments/transfers/__tests__/mutations.test.ts` focuses mostly on pure provider/type logic and does not validate full RBAC mutation handlers.
- Existing reconciliation and bridge tests already exercise transfer table behavior and should remain passing.

## Repository Quality Requirements (AGENTS.md)
- Must run and pass before completion:
  - `bun check`
  - `bun typecheck`
  - `bunx convex codegen`
- Workflow rule: run `bun check` before trying targeted lint/format fixes.

## Completion Expectations
- Keep changes minimal and scoped to ENG-201.
- Preserve existing API behavior where not explicitly changed by this issue.
- Note any external/manual follow-up (WorkOS dashboard permissions) in final report.
