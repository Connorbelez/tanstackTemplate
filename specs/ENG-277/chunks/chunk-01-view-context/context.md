# Chunk Context: chunk-01-view-context

## Goal
- Replace the admin scaffold query path with a canonical view-engine context path that can power both table and kanban.

## Relevant plan excerpts
- "Production admin routes must resolve object/view/saved-view context through one canonical view-engine path rather than route-local lookup logic."
- "Saved-view and system-view contracts must remain the source of truth for selected layout and bound board field."

## Implementation notes
- `convex/admin/queries.ts:listEntityRows` is still a scaffold query limited to `mortgages`, `properties`, `listings`, and `deals`.
- `src/lib/admin-entity-queries.ts` still points at that scaffold query.
- `src/lib/admin-entities.ts` only includes four entity types, while `src/lib/admin-entity-routes.ts` includes six dedicated routes.
- `convex/crm/viewDefs.ts`, `convex/crm/viewState.ts`, and `convex/crm/userSavedViews.ts` already contain the core control-plane contracts needed for canonical resolution.

## Existing code touchpoints
- `convex/admin/queries.ts`
- `src/lib/admin-entity-queries.ts`
- `src/lib/admin-entity-routes.ts`
- `src/lib/admin-entities.ts`
- `convex/crm/viewDefs.ts`
- `convex/crm/viewState.ts`
- `convex/crm/userSavedViews.ts`

## Validation
- Query hooks resolve object/view state without `listEntityRows`.
- Entity typing is consistent between generic and dedicated admin routes.
- Targeted tests cover the new context resolution logic.
