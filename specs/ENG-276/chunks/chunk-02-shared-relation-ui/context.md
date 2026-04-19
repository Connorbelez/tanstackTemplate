# Chunk Context: chunk-02-shared-relation-ui

## Goal
- Render relation-backed cells as reusable chips/links across table, kanban, and generic detail surfaces while preserving shared sidebar navigation semantics.

## Relevant plan excerpts
- "Multi-relation cells render a collapsed truncated state and an inline expanded state that pushes surrounding layout downward instead of using detached hover-only UI."
- "Only one relation cell expansion may be open per rendered surface in MVP."
- "Clicking a relation chip opens the related record in the shared detail sheet when the sidebar provider context is available, and falls back to the correct full detail page route when it is not."
- "Generic detail rendering handles relation payloads meaningfully so fallback detail sections do not degrade to raw JSON once relation values become structured."

## Implementation notes
- `src/components/admin/shell/AdminEntityTableView.tsx` and `AdminEntityKanbanView.tsx` are now row/cell-aware and route relation payloads through the shared `RelationCell` component.
- `renderAdminFieldValue` still handles scalar/select-style values, while relation rendering is layered on through `RelationCell` so non-relation output stays unchanged.
- Full-page fallback routing is centralized in `src/lib/admin-relation-navigation.ts`, keeping `RecordSidebar`, `LinkedRecordsPanel`, and relation cells aligned on dedicated-vs-generic detail routes.
- Relation-chip clicks must stop propagation so row selection still works when clicking elsewhere in the row/card.
- Treat this file as implementation context, not lint-oriented code. Verify relation rendering and fallback routing against the actual components before flagging documentation drift.

## Existing code touchpoints
- `src/components/admin/shell/admin-view-types.ts`
- `src/components/admin/shell/admin-view-rendering.tsx`
- `src/components/admin/shell/AdminEntityTableView.tsx`
- `src/components/admin/shell/AdminEntityKanbanView.tsx`
- `src/components/admin/shell/FieldRenderer.tsx`
- `src/components/admin/shell/RecordSidebar.tsx`
- `src/components/admin/shell/LinkedRecordsPanel.tsx`
- `src/components/admin/shell/RecordSidebarProvider.tsx`
- `src/hooks/useAdminDetailSheet.tsx`
- `src/lib/admin-entity-routes.ts`

## Validation
- Component tests cover collapsed vs expanded relation display, single-open behavior, and chip click propagation; route fallback behavior is verified through the admin shell navigation tests.
