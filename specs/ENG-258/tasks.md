# ENG-258: Linked Records Panel & Activity Timeline — Master Tasks

## Chunk 1: Backend — Activity Timeline Query
- [x] T-001: Add activity event types to `convex/crm/types.ts`
- [x] T-002: Create `convex/crm/activityQueries.ts` — `getRecordActivity` query that fetches audit log events for a record (by resourceId), enriches with actor info (user name/avatar from users table), and returns paginated results
- [x] T-003: Quality gate — `bun check && bun typecheck && bunx convex codegen`

## Chunk 2: Frontend — LinkedRecordsPanel
- [x] T-004: Create `src/components/admin/shell/LinkedRecordsPanel.tsx` — main panel component that calls `getLinkedRecords` query, groups by link type, renders expandable sections
- [x] T-005: Create `src/components/admin/shell/AddLinkDialog.tsx` — dialog to search records and create a new link (calls `searchRecords` + `createLink`)
- [x] T-006: Wire remove link action (calls `deleteLink` mutation with confirmation)
- [x] T-007: Quality gate — `bun check && bun typecheck`

## Chunk 3: Frontend — ActivityTimeline
- [x] T-008: Create `src/components/admin/shell/ActivityTimeline.tsx` — chronological event list using `getRecordActivity` query, with event type icons, actor info, timestamps
- [x] T-009: Create `src/components/admin/shell/FieldDiffDisplay.tsx` — renders before/after diffs for field_updated events
- [x] T-010: Add infinite scroll pagination to ActivityTimeline
- [x] T-011: Quality gate — `bun check && bun typecheck`

## Notes
- `bunx convex codegen` now passes in this workspace after replacing Convex test `import.meta.glob(...)` usage with static shared module maps under `convex/test/`.
