# Summary: ENG-280 - View Engine — Dedicated Entity Adapter Rollout for Listings, Mortgages, Obligations, and Borrowers

- Source issue: https://linear.app/fairlend/issue/ENG-280/view-engine-dedicated-entity-adapter-rollout-for-listings-mortgages
- Primary plan: https://www.notion.so/343fc1b4402481b2bf31c12ee47f17f6
- Supporting docs:
  - https://www.notion.so/336fc1b4402481eba141c9c8cf17a600
  - https://www.notion.so/337fc1b44024810e9157f7433d1feac7
  - https://www.notion.so/341fc1b440248134b191da5114d9875b
  - https://www.notion.so/343fc1b4402481e7bf4ee591c48aa401
  - https://www.notion.so/341fc1b4402481599b9feebaa5801f61

## Scope
- Add listings to the native CRM bootstrap and query-adapter path so `/admin/listings` resolves through live system-object data.
- Expand dedicated adapter behavior for listings, mortgages, obligations, and borrowers with richer default fields, computed or summary fields, and relation-aware display semantics.
- Add batched dedicated hydration for entity-specific summary data that is needed in table, kanban, and detail surfaces.
- Seed or repair curated default system views and aggregate presets for the rollout entities without regressing fallback entities.
- Upgrade shared table and kanban row headers plus dedicated detail renderers so these entities no longer read like generic scaffold records.
- Add or update backend and admin-shell tests for native listings support, dedicated hydration, curated views, and dedicated detail rendering.

## Constraints
- Reuse the existing shared admin surfaces from ENG-275, ENG-276, and ENG-279 instead of adding route-local table or detail implementations.
- Keep properties out of dedicated rollout scope except where property data is supporting context for listings and mortgages.
- Calendar behavior and calendar default views are out of scope.
- No new `any` types.
- `bun check`, `bun typecheck`, and `bunx convex codegen` are required quality gates.
- GitNexus MCP and CLI are unavailable in this session, so impact analysis must use direct caller/import sweeps as the fallback safety mechanism before edits.

## Open questions
- Whether curated system defaults should include a kanban view for any rollout entity beyond the adapter’s preferred kanban field when the current UX value is clearly justified.
- How much listing detail richness can be delivered from the existing listing queries without adding new admin-specific backend query surfaces.
