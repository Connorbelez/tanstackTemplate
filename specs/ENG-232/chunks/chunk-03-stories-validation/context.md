# Chunk Context: chunk-03-stories-validation

## Goal
- Add reusable story coverage for the new page surface and finish the required repo quality gates.

## Relevant plan excerpts
- "Add comprehensive Storybook stories for every reusable UI component introduced in this issue."
- "Stories must cover the default state plus all meaningful variants and interaction states relevant to the component(s), including loading, empty, validation or error states where applicable, responsive/mobile layouts, and edge-case content."

## Implementation notes
- Existing story files already cover `EntityTable`, `EntityTableToolbar`, `cell-renderers`, and `AdminEntityViewToolbar`. The new full-page surface should align with that pattern.
- If route-level logic is too coupled for a focused unit test, document the gap and rely on story coverage plus type/lint validation.
- Required repo gates are `bunx convex codegen`, `bun check`, and `bun typecheck`. Run targeted tests after those where practical.

## Existing code touchpoints
- `src/components/admin/shell/*.stories.tsx`
- Any new `EntityPage` story file
- Relevant test files under `src/test/`

## Validation
- Storybook coverage exists for the reusable page surface and important states.
- Required project quality gates pass.
- Any residual test gap is documented explicitly in the final artifact and final report.
