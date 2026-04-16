# Summary: ENG-276 - View Engine — Relation Cells, Inline Expansion, and Cross-Entity Navigation

- Source issue: https://linear.app/fairlend/issue/ENG-276/view-engine-relation-cells-inline-expansion-and-cross-entity
- Primary plan: https://www.notion.so/343fc1b4402481e7bf4ee591c48aa401
- Supporting docs:
  - https://www.notion.so/336fc1b4402481eba141c9c8cf17a600
  - https://www.notion.so/341fc1b440248134b191da5114d9875b
  - https://www.notion.so/341fc1b4402481599b9feebaa5801f61

## Scope
- Add a typed relation cell payload to the shared CRM view-engine row contract.
- Hydrate relation-backed field values in backend table and kanban queries without changing calendar behavior.
- Render relation chips for single and multi-relation cells in table and kanban surfaces with inline expansion for multi-value overflow.
- Reuse shared sidebar/detail navigation with full-page fallback for relation chip clicks.
- Render structured relation payloads meaningfully in generic detail sections instead of JSON-dumping them.
- Add backend and frontend tests for relation hydration, single-open inline expansion, and navigation fallback behavior.

## Constraints
- Reuse the shared admin view surfaces from `ENG-275` and the shared detail surface from `ENG-279`; do not create route-local relation behavior.
- Keep calendar views and calendar query contracts unchanged.
- Only one relation cell expansion may be open per rendered surface in MVP.
- No new `any` types.
- `bun check`, `bun typecheck`, and `bunx convex codegen` are required quality gates.
- GitNexus MCP/CLI is unavailable in this session, so pre-edit impact analysis uses direct caller/import sweeps as the fallback safety check.

## Open questions
- None blocking. For high-cardinality relation cells, cap the visible expanded list in MVP rather than attempting virtualization.
