# Chunk Context: chunk-04-tests-and-validation

## Goal
- Verify the final change set against the issue requirements, repo quality gates, and intended scope.

## Relevant plan excerpts
- Automated tests cover the new detail query/resolver and the dedicated-vs-fallback rendering path.
- `bun check`, `bun typecheck`, and `bunx convex codegen` must pass before implementation is considered complete.

## Implementation notes
- Prefer targeted backend and admin-shell tests first, then broader repo gates.
- Run `gitnexus_detect_changes` before close-out to confirm the changed symbols and affected flows match the plan.
- Document any inapplicable e2e or Storybook expectations explicitly.

## Existing code touchpoints
- `convex/crm/__tests__/viewEngine.test.ts`
- `src/test/admin/admin-shell.test.ts`
- repo-level validation commands from `AGENTS.md`

## Validation
- `bun run test`
- `bun check`
- `bun typecheck`
- `bunx convex codegen`
- `gitnexus_detect_changes`
