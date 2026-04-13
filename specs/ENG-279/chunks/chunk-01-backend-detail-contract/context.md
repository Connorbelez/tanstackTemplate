# Chunk Context: chunk-01-backend-detail-contract

## Goal
- Deliver the backend detail-surface contract that frontend detail renderers can consume without depending on a source `viewDefId`.

## Relevant plan excerpts
- `fieldDefs.listFields` plus `recordQueries.getRecordReference` is not enough for detail rendering because it omits adapter-computed fields and detail-relevant field overrides assembled in `viewState.ts`.
- The detail surface receives normalized field definitions that include adapter-computed fields, field overrides, relation metadata, and editability metadata.

## Implementation notes
- Reuse existing `resolveEntityViewAdapterContract` and `resolveViewState` assembly paths instead of introducing a second normalization pipeline.
- Prefer extracting helper logic from `viewState.ts` so `viewQueries` and detail queries share the same field semantics.
- Keep the public detail query scoped to the data already needed by the shared detail UI: record, object definition, normalized fields, and adapter contract.

## Existing code touchpoints
- `convex/crm/viewState.ts`
- `convex/crm/recordQueries.ts`
- `convex/crm/entityAdapterRegistry.ts`
- `convex/crm/types.ts`
- `convex/crm/__tests__/viewEngine.test.ts`

## Validation
- targeted backend tests for view engine and record queries
- `bunx convex codegen`
