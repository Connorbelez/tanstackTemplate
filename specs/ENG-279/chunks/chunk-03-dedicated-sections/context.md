# Chunk Context: chunk-03-dedicated-sections

## Goal
- Add reusable dedicated detail section modules for the first high-value entities and remove any remaining placeholder-only detail boundary confusion.

## Relevant plan excerpts
- Dedicated entities can assemble detail experiences from reusable section modules rather than monolithic route-local pages.
- The first implementation pass supports domain-rich sections for property context, comparables, documents, and other document-adjacent panels where those concepts exist.
- Placeholder-only detail paths are wrapped or retired so there is one canonical implementation boundary.

## Implementation notes
- Reuse the information architecture from `src/components/demo/listings/ListingDetailPage.tsx` where practical, but do not copy the entire demo page into admin.
- Start from the data already available in the detail-surface contract. Do not invent broad new domain-query surfaces unless strictly necessary.
- Keep section primitives generic so ENG-280 can reuse them during dedicated entity rollout.

## Existing code touchpoints
- `src/components/demo/listings/ListingDetailPage.tsx`
- `src/components/admin/shell/AdminDetailSheet.tsx`
- new `src/components/admin/shell/detail-sections/*`
- `src/components/admin/shell/entity-view-adapters.tsx`

## Validation
- admin-shell tests
- visual behavior covered by existing test infrastructure if available
