# Chunk Context: chunk-03-validation-and-regressions

## Goal
- Prove the backend payload and shared admin-shell behavior work together and that unchanged surfaces, especially calendar and existing navigation flows, do not regress.

## Relevant plan excerpts
- "Validation includes backend relation payload hydration plus frontend expansion/navigation behavior."
- "`bun check`, `bun typecheck`, and `bunx convex codegen` must pass."
- "Automated tests cover backend relation hydration and frontend inline expansion/navigation for at least one dedicated entity and one fallback entity."

## Implementation notes
- Backend coverage belongs in `convex/crm/__tests__/viewEngine.test.ts`.
- Frontend coverage should live in focused admin-shell tests rather than broad route tests when possible.
- Storybook is not the primary proof point here unless a new reusable presentational primitive clearly benefits from it.
- Final scope validation must compare the final diff against the planned backend/frontend touchpoints because GitNexus is unavailable.

## Existing code touchpoints
- `convex/crm/__tests__/viewEngine.test.ts`
- `src/test/admin/admin-shell.test.ts`
- `src/test/admin/field-renderer.test.tsx`
- any new targeted relation-cell test file under `src/test/admin/`

## Validation
- `bun check`
- `bun typecheck`
- `bunx convex codegen`
- targeted `bun run test` invocations for the touched backend/admin-shell scope
