# Chunk Context: chunk-01-page-surface

## Goal
- Externalize the ENG-232 scope and build the reusable full-page detail shell that the dedicated entity routes will consume.

## Relevant plan excerpts
- "Treat the full-page detail as the canonical destination and the sidebar as the in-context preview of the same underlying record contract."
- "Reuse the sidebar’s Details / Relations / History building blocks, then add a summary rail and custom slots around them."
- "System-level entities should use dedicated file routes because their full-page UX is domain-specific; the generic `/admin/$entitytype/$id` route is reserved for dynamic or non-critical entities."

## Implementation notes
- `RecordSidebar.tsx` already contains most of the shared detail tabs and record-loading logic. The page implementation should build on that instead of duplicating the loader path.
- `AdminRecordDetailPage.tsx` currently renders the same record detail surface with `variant="page"` but without a dedicated page layout.
- `entity-view-adapters.tsx`, `detail-sections.tsx`, and `dedicated-detail-panels.tsx` already provide dedicated detail rendering for several entities and should remain the primary customization seam.
- Summary/sidebar content will likely need a new adapter seam or a derived default based on existing fields and record metadata.

## Existing code touchpoints
- `src/components/admin/shell/AdminRecordDetailPage.tsx`
- `src/components/admin/shell/RecordSidebar.tsx`
- `src/components/admin/shell/entity-view-adapters.tsx`
- `src/components/admin/shell/detail-sections.tsx`
- `src/components/admin/shell/dedicated-detail-panels.tsx`

## Validation
- Shared page surface renders in desktop and mobile layouts.
- Existing detail tabs still work in the full-page context.
- New page surface keeps the existing record-loading behavior intact.
