# Chunk Context: chunk-04-tests-and-validation

## Goal
- Lock in regression coverage, run the repo quality gates, complete the manual or documented signable checkpoint, and gate the result with the spec audit.

## Relevant plan excerpts
- "Add backend and UI coverage for successful signing, unresolved recipient resolution, provider failures, access denial, and retry behavior."
- "Validate the work with `bunx convex codegen`, `bun check`, `bun typecheck`, `bun run test`, and the manual signing checkpoint."
- "Treat the audit as a release gate, not a nice-to-have review."

## Implementation notes
- Preserve existing phase 7 static and non-signable behavior while adding signable coverage.
- If live Documenso credentials or webhook automation are unavailable in this worktree, record the exact manual validation gap instead of silently skipping it.
- The final audit result belongs in `specs/ENG-288/audit.md` and must be reflected in `status.md` before the issue can be reported complete.

## Existing code touchpoints
- `src/test/convex/documents/dealPackages.test.ts`
- `src/test/lender/deal-detail-page.test.tsx`
- `src/test/admin/deal-dedicated-details.test.tsx`
- `e2e/origination/deal-package-materialization.spec.ts`
- `specs/ENG-288/audit.md`

## Validation
- `bunx convex codegen`
- `bun check`
- `bun typecheck`
- `bun run test`
- `bun run test:e2e`
- `$linear-pr-spec-audit`
