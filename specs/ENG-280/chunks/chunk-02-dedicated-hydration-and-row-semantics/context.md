# Chunk Context: chunk-02-dedicated-hydration-and-row-semantics

## Goal
- Expand dedicated adapter behavior and add batched summary hydration so rollout entities get richer list, kanban, and detail semantics without breaking fallback entities.

## Relevant plan excerpts
- Dedicated adapter definitions for listings, mortgages, obligations, and borrowers define title/status candidates, layout defaults, visible-field order, and field overrides.
- The backend supports dedicated entity hydration for domain-specific summary or computed columns that require more than record-local fields, and that hydration runs for table, kanban, and detail queries.
- Shared table and kanban row/card presentation become adapter-aware so the primary admin UX for these entities no longer depends on generic record title/supporting-text scaffolding.

## Implementation notes
- `entityAdapterRegistry.ts` currently has only minimal dedicated definitions for listings and properties and thin defaults for the other rollout entities.
- `entityViewFields.ts` only materializes a single record-local borrower computed field today, so richer rollout behavior likely needs a broader adapter field contract and a hydration stage.
- `viewQueries.ts` already centralizes table and kanban assembly; extend that path rather than threading dedicated logic through React routes.
- `admin-view-rendering.tsx` currently derives a generic title and created-date supporting text for all entities.

## Existing code touchpoints
- `convex/crm/types.ts`
- `convex/crm/entityAdapterRegistry.ts`
- `convex/crm/entityViewFields.ts`
- `convex/crm/viewQueries.ts`
- `convex/crm/recordQueries.ts`
- `src/components/admin/shell/admin-view-rendering.tsx`
- `src/components/admin/shell/AdminEntityTableView.tsx`
- `src/components/admin/shell/AdminEntityKanbanView.tsx`
- `convex/crm/__tests__/viewEngine.test.ts`
- `convex/crm/__tests__/records.test.ts`

## Validation
- targeted view-engine and record-query tests
- admin-shell tests for row/card semantics
