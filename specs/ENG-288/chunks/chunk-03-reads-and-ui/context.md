# Chunk Context: chunk-03-reads-and-ui

## Goal
- Expose normalized signable document state through deal queries and replace both portal and admin signable placeholders with actionable, recipient-aware UI.

## Relevant plan excerpts
- "Replace lender/admin “Reserved Signable Documents” placeholders with real signable rows, normalized recipient chips, envelope details, and admin operational controls."
- "The portal MUST never talk directly to Documenso."
- "Lender and admin deal surfaces show normalized signable statuses, recipient chips, envelope-level error/sync metadata, and only the actions appropriate to the viewer."

## Implementation notes
- Expand the deal read model with canonical envelope status, recipient status, last sync, last error, and whether the current viewer may launch embedded signing.
- Keep session creation backend-issued and return only iframe-safe session metadata; refresh document status after the signing experience closes or sync completes.
- Show normalized copy and actions in admin and lender surfaces; do not leak Documenso-specific admin URLs or raw provider-only concepts.

## Existing code touchpoints
- `convex/deals/queries.ts`
- `convex/documents/dealPackages.ts`
- `src/components/lender/deals/LenderDealDetailPage.tsx`
- `src/components/admin/shell/dedicated-detail-panels.tsx`
- GitNexus impact: `readDealDocumentPackageSurface` is LOW risk with two direct callers, `convex/deals/queries.ts` and `convex/crm/detailContextQueries.ts`.
- GitNexus impact: `getPortalDealDetail`, `LenderDealDetailPage`, and `DealsDedicatedDetails` are all LOW risk with no broader execution-flow blast radius surfaced by the index.

## Validation
- `bun check`
- `bun typecheck`
- `bun run test -- deal-detail-page`
- `bun run test -- deal-dedicated-details`
