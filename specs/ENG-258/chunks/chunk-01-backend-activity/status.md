# Chunk 01: Backend — Activity Timeline Query

Completed: 2026-03-31

## Tasks Completed
- [x] T-001: Added `ActivityEvent` and `ActivityQueryResult` to `convex/crm/types.ts`.
- [x] T-002: Added `convex/crm/activityQueries.ts` with actor enrichment, resource-type-aware activity loading, cursor-based pagination (continueCursor/isDone), and event mapping for timeline consumption.
- [x] Added mirrored record/native audit entries in `convex/crm/recordLinks.ts` so link create/delete activity appears in record timelines.

## Tasks Remaining
- None.

## Quality Gate
- `bun check`: pass (warnings only, pre-existing complexity warnings in unrelated files)
- `bun typecheck`: pass
- `bunx convex codegen`: pass

## Notes
- `convex/_generated/api.d.ts` is now generated from the live Convex deployment.
- Added shared static module-map helpers under `convex/test/` so Convex-side test files no longer block deploy/codegen with `import.meta.glob(...)`.
