# Chunk Context: chunk-02-routing-navigation

## Goal
- Keep dedicated entity routes as the public admin detail entrypoints while standardizing breadcrumb, back-link, and full-page navigation behavior on top of the shared page.

## Relevant plan excerpts
- "System-level entities should use dedicated file routes because their full-page UX is domain-specific."
- "The back button should prefer returning to the entity list route derived from `AdminEntityDefinition.route`, not browser history only."
- "Use registry + loader data to provide the record title to breadcrumbs."

## Implementation notes
- Dedicated routes already exist for listings, mortgages, obligations, borrowers, deals, and properties.
- `resolveAdminRecordRouteTarget` currently chooses dedicated routes for those entity types and falls back to `/admin/$entitytype/$recordid`.
- `AdminBreadcrumbs` currently converts the leaf route to `Record {id}`, so it needs a title-resolution seam.
- `AdminDetailSheet` and `useAdminDetailSheet` still support the old sheet path and must remain compatible with the page updates.

## Existing code touchpoints
- `src/lib/admin-relation-navigation.ts`
- `src/lib/admin-entity-routes.ts`
- `src/components/admin/shell/AdminBreadcrumbs.tsx`
- `src/routes/admin/$entitytype.$recordid.tsx`
- `src/routes/admin/listings/$recordid.tsx`
- `src/routes/admin/mortgages/$recordid.tsx`
- `src/routes/admin/obligations/$recordid.tsx`
- `src/routes/admin/borrowers/$recordid.tsx`
- `src/routes/admin/deals/$recordid.tsx`
- `src/routes/admin/properties/$recordid.tsx`

## Validation
- Direct entry to a dedicated detail route loads the shared page.
- Sidebar "Open Full Page" navigation lands on the same shared page.
- Breadcrumb leaf shows the record title instead of a record-id placeholder.
