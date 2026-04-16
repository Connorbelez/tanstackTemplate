# Chunk Context: chunk-02-shared-relation-ui

## Goal
- Render relation-backed cells as reusable chips/links across table, kanban, and generic detail surfaces while preserving shared sidebar navigation semantics.

## Relevant plan excerpts
- "Multi-relation cells render a collapsed truncated state and an inline expanded state that pushes surrounding layout downward instead of using detached hover-only UI."
- "Only one relation cell expansion may be open per rendered surface in MVP."
- "Clicking a relation chip opens the related record in the shared detail sheet when the sidebar provider context is available, and falls back to the correct full detail page route when it is not."
- "Generic detail rendering handles relation payloads meaningfully so fallback detail sections do not degrade to raw JSON once relation values become structured."

## Implementation notes
- `src/components/admin/shell/AdminEntityTableView.tsx` and `AdminEntityKanbanView.tsx` both still render via `renderAdminFieldValue(field, record.fields[column.name])`; both need to move to row/cell-aware rendering, ideally through one shared relation component.
- `renderAdminFieldValue` currently formats only scalar/select-like values, so relation handling should be additive and not break non-relation cell output.
- `RecordSidebar` already computes full-page fallbacks using `getDedicatedAdminRecordRoute` and generic `/admin/$entitytype/$recordid`; centralize that logic in a shared helper so `LinkedRecordsPanel` and new relation cells behave identically.
- Relation-chip clicks must stop propagation so row selection still works when clicking elsewhere in the row/card.

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
- Component tests should cover collapsed vs expanded relation display, single-open behavior, chip click propagation, and sidebar-vs-page fallback navigation.
