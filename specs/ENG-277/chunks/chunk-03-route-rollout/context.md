# Chunk Context: chunk-03-route-rollout

## Goal
- Move the admin routes in scope onto the shared production surface and add the coverage needed to prove the behavior.

## Relevant plan excerpts
- "Shared admin routes in scope use real view-engine data instead of scaffolded or fake route-local list models for kanban-capable entities."
- "Tests cover at least one dedicated entity and one metadata-driven fallback entity."

## Implementation notes
- `/admin/$entitytype`, `/admin/listings`, `/admin/mortgages`, `/admin/properties`, `/admin/borrowers`, and `/admin/obligations` are still scaffold or fake-data routes.
- `/admin/deals` is already a dedicated kanban route and is a reference only for this issue.
- Storybook is present in the repo for admin shell components, so reusable control changes should either update stories or explicitly justify why they are unnecessary.
- Playwright coverage may or may not be practical depending on available route fixtures; if it is not, note why.

## Existing code touchpoints
- `src/routes/admin/$entitytype.tsx`
- `src/routes/admin/listings/route.tsx`
- `src/routes/admin/mortgages/route.tsx`
- `src/routes/admin/properties/route.tsx`
- `src/routes/admin/borrowers/route.tsx`
- `src/routes/admin/obligations/route.tsx`
- `src/routes/admin/deals/route.tsx`
- existing tests under `convex/crm/**` and `src/components/admin/**`

## Validation
- In-scope routes no longer use scaffold row arrays or fake route-local data as the primary model.
- Coverage proves at least one dedicated route and one fallback route.
- Required repo checks pass.
- `gitnexus_detect_changes` matches the intended implementation scope.
