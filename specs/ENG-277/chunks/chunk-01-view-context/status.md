# Status: chunk-01-view-context

- Result: completed
- Completed at: 2026-04-13

## Completed tasks
- Added `src/lib/admin-view-context.ts` to resolve admin entity type -> object definition -> active table/kanban source view -> default saved view.
- Expanded `src/lib/admin-entities.ts` so generic admin routes and detail pages use the same entity key set as the admin registry.
- Replaced the generic route's `listEntityRows` path with the shared view-engine-backed admin surface.

## Validation
- GitNexus impact checks completed before editing `isAdminEntityType`, `admin-entities.ts`, and the generic admin route symbols.
- `src/test/admin/admin-view-context.test.ts` covers saved-view selection and system-view fallback behavior.

## Notes
- `getAdminEntityByType` remains untouched because its GitNexus blast radius was HIGH; the implementation routes around it through lower-risk seams.
