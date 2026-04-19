# Summary: ENG-232 - Admin Shell - EntityPage (Full Entity Detail View)

- Source issue: https://linear.app/fairlend/issue/ENG-232/admin-shell-entitypage-full-entity-detail-view
- Primary plan: https://www.notion.so/336fc1b4402481baba83cc1e48c915ef
- Supporting docs:
  - https://www.notion.so/334fc1b4402480dab40fe17598a9b990
  - https://www.notion.so/329fc1b440248154a3fdc2fb5487acd7
  - https://www.notion.so/336fc1b4402481b1ab28d94fc1be02b5

## Scope
- Build the reusable full-page admin entity detail surface on top of the existing record detail infrastructure.
- Preserve dedicated file routes for system entities while making them render the shared full-page detail page.
- Reuse the sidebar's record semantics, tab content, field formatting, and detail adapters instead of creating a second detail system.
- Add the two-column desktop layout, summary rail, breadcrumb/back behavior, and entity-specific extension slots expected by ENG-232.
- Add reusable-story coverage for the new page surface.

## Constraints
- System-level entities keep dedicated file routes; the generic `/admin/$entitytype/$recordid` route remains a fallback for dynamic or non-critical entities.
- Breadcrumb and back-link behavior should derive from the admin entity registry, not per-route switch logic.
- Existing detail loaders currently resolve through `api.crm.recordQueries.getRecordDetailSurface`; the page must stay compatible with that contract.
- GitNexus MCP is unavailable in this environment and the local CLI bootstrap failed, so impact analysis will be documented via a manual caller/usage pass before edits.

## Open questions
- No blocking product questions remain. The route-shape contradiction is resolved by the issue comment and Notion plan: keep dedicated file routes for system entities and consume the shared page inside them.
