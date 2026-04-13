# Status: chunk-02-kanban-surface

- Result: completed
- Completed at: 2026-04-13

## Completed tasks
- Added a shared `AdminEntityViewPage` orchestration surface with read-only table and kanban renderers.
- Added `AdminEntityViewToolbar`, `AdminEntityTableView`, `AdminEntityKanbanView`, and supporting admin view rendering/types modules.
- Persisted layout selection through default saved views and persisted kanban bound-field changes through `crm.viewDefs.createView/updateView`.
- Tightened kanban eligibility to single-select fields only in `convex/crm/metadataCompiler.ts`, `viewState.ts`, and `viewDefs.ts`.

## Validation
- `convex/crm/__tests__/metadataCompiler.test.ts` and `convex/crm/__tests__/viewEngine.test.ts` pass with the new single-select-only kanban contract.
- Storybook coverage added at `src/components/admin/shell/AdminEntityViewToolbar.stories.tsx`.

## Notes
- `deriveLayoutEligibility` and `deriveDisabledLayoutMessages` were both pre-checked in GitNexus with LOW/MEDIUM risk and updated without touching HIGH-risk admin shell symbols.
