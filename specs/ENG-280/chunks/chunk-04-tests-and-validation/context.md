# Chunk Context: chunk-04-tests-and-validation

## Goal
- Prove the dedicated rollout works end to end for the touched CRM/admin-shell scope and reconcile the final diff against the intended change set.

## Relevant plan excerpts
- Validation covers native listings bootstrap/query behavior, dedicated hydration of computed fields, curated system views, and dedicated detail rendering for the rollout entities.
- `bun check`, `bun typecheck`, and `bunx convex codegen` must pass.

## Implementation notes
- Prefer targeted CRM/admin-shell tests first, then repo-wide gates.
- Because GitNexus is unavailable in this session, final scope verification must use `git diff`, targeted caller/import sweeps, and test coverage rather than `gitnexus_detect_changes`.
- If e2e or Storybook coverage is not appropriate, document why directly in `execution-checklist.md`.

## Existing code touchpoints
- `convex/crm/__tests__/systemAdapters.test.ts`
- `convex/crm/__tests__/viewEngine.test.ts`
- `convex/crm/__tests__/records.test.ts`
- `src/test/admin/admin-shell.test.ts`
- repo validation commands from `AGENTS.md`

## Validation
- targeted CRM/admin-shell tests
- `bun check`
- `bun typecheck`
- `bunx convex codegen`
