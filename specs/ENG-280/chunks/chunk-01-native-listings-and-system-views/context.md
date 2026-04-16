# Chunk Context: chunk-01-native-listings-and-system-views

## Goal
- Add native listings support to the CRM system-adapter path and make curated default system views seed or repair correctly for the rollout entities.

## Relevant plan excerpts
- `queryAdapter.ts` does not support native listings today, so `/admin/listings` cannot resolve through the shared CRM-native path.
- Curated system default views are seeded or repaired idempotently for each rollout entity, including visible fields, field order, and aggregate presets.

## Implementation notes
- `convex/crm/systemAdapters/bootstrap.ts` currently boots only one default table view per system object and does not include listings.
- `convex/crm/systemAdapters/queryAdapter.ts` currently supports mortgages, borrowers, lenders, brokers, deals, and obligations only.
- Reuse the existing view-engine contracts in `viewDefs`, `viewState`, and `AdminEntityViewPage`; do not create route-local defaults.
- Keep properties as supporting data only. Do not broaden this chunk into a full dedicated property rollout.

## Existing code touchpoints
- `convex/crm/systemAdapters/bootstrap.ts`
- `convex/crm/systemAdapters/queryAdapter.ts`
- `convex/crm/viewDefs.ts`
- `convex/crm/viewState.ts`
- `convex/crm/__tests__/systemAdapters.test.ts`
- `convex/crm/__tests__/viewEngine.test.ts`

## Validation
- targeted CRM adapter tests for native listings support
- targeted view-engine tests for curated default view state
- `bunx convex codegen`
