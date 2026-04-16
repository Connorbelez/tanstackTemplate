# Chunk Context: chunk-03-dedicated-detail-rollout

## Goal
- Deliver richer dedicated detail surfaces for listings, mortgages, obligations, and borrowers through the shared registry and reusable section primitives.

## Relevant plan excerpts
- Listings have a non-barren dedicated detail sheet/page experience through the shared renderer registry instead of the current generic fallback field grid.
- Mortgage detail sheets/pages are expanded enough to support upcoming origination/admin workflows.
- Obligations and borrowers expose dedicated detail rendering rather than reading like generic field dumps.
- Dedicated detail modules reuse existing domain queries where available, especially for listing availability/appraisals/encumbrances/transaction history and mortgage-linked supporting context.

## Implementation notes
- `entity-view-adapters.tsx` currently provides only thin section layouts and has no dedicated listings renderer.
- `detail-sections.tsx` already contains reusable section primitives from ENG-279; keep using those rather than creating route-local detail pages.
- `convex/listings/queries.ts` already exposes listing availability, appraisals, encumbrances, and transaction history queries that can be reused.
- Keep notes/files/history/relations tabs on the existing `RecordSidebar` shell.

## Existing code touchpoints
- `src/components/admin/shell/entity-view-adapters.tsx`
- `src/components/admin/shell/detail-sections.tsx`
- `src/components/admin/shell/RecordSidebar.tsx`
- `convex/listings/queries.ts`
- `src/components/demo/listings/ListingDetailPage.tsx`
- `src/test/admin/admin-shell.test.ts`

## Validation
- targeted admin-shell tests for dedicated renderer selection and section output
- any additional backend tests needed for new detail-surface data
