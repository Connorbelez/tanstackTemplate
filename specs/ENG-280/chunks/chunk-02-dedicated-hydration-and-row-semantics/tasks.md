# Chunk: chunk-02-dedicated-hydration-and-row-semantics

- [ ] T-004: Expand `convex/crm/entityAdapterRegistry.ts` with richer dedicated definitions for listings, mortgages, obligations, and borrowers, including title/status candidates, preferred visible fields, and any necessary field overrides.
- [ ] T-005: Extend the dedicated-field contract in `convex/crm/types.ts` and `convex/crm/entityViewFields.ts` so adapter-driven summary or computed fields can carry the metadata needed for relation-aware display where required.
- [ ] T-006: Add batched dedicated hydration in `convex/crm/viewQueries.ts`, `convex/crm/recordQueries.ts`, and supporting helpers so list, kanban, and detail queries receive entity-specific summary data without per-row N+1 behavior.
- [ ] T-007: Make shared row and card headers adapter-aware in `src/components/admin/shell/admin-view-rendering.tsx`, `AdminEntityTableView.tsx`, and `AdminEntityKanbanView.tsx`.
